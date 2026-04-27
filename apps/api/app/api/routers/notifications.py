from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import AuthUser, get_current_user
from app.db.supabase import get_supabase

router = APIRouter(prefix="/notifications", tags=["notifications"])

RETURN_DONE_STATUSES = {"received", "inspected", "restocked", "closed", "cancelled"}
TICKET_DONE_STATUSES = {"resolved", "closed", "cancelled"}


@router.get("")
def list_notifications(user: Annotated[AuthUser, Depends(get_current_user)]) -> dict[str, Any]:
    client = get_supabase()
    now = datetime.now(UTC)
    notifications: list[dict[str, Any]] = []

    if user.app_role == "admin":
        requests = (
            client.table("staff_access_requests")
            .select("*")
            .eq("status", "pending")
            .order("created_at", desc=True)
            .limit(10)
            .execute()
            .data
            or []
        )
        for request in requests:
            notifications.append(
                _notification(
                    id=f"access-request-{request['id']}",
                    kind="staff_access",
                    severity="critical",
                    title="Staff access approval needed",
                    message=f"{request['full_name']} requested {request['requested_role']} access.",
                    href="/staff",
                    action_label="Review request",
                    created_at=request["created_at"],
                )
            )

    if user.app_role in {"admin", "dispatcher"}:
        returns = (
            client.table("returns")
            .select("id,status,requested_at,scheduled_at,equipment_id,patient_id,patients(full_name),equipment(serial_number,make,model)")
            .order("requested_at", desc=True)
            .limit(100)
            .execute()
            .data
            or []
        )
        overdue_cutoff = now - timedelta(days=7)
        for record in returns:
            requested_at = _parse_date(record.get("requested_at"))
            equipment = _equipment_label(record)
            patient = record.get("patients", {}).get("full_name") if record.get("patients") else "patient"
            if record["status"] not in RETURN_DONE_STATUSES and requested_at and requested_at < overdue_cutoff:
                age_days = (now - requested_at).days
                notifications.append(
                    _notification(
                        id=f"return-overdue-{record['id']}",
                        kind="overdue_return",
                        severity="critical",
                        title="Return is overdue",
                        message=f"{equipment} for {patient} has been in return workflow for {age_days} days.",
                        href="/returns",
                        action_label="Open returns",
                        created_at=record["requested_at"],
                    )
                )
            elif record["status"] == "received":
                notifications.append(
                    _notification(
                        id=f"return-inspection-{record['id']}",
                        kind="return_inspection",
                        severity="warning",
                        title="Returned unit needs inspection",
                        message=f"{equipment} has been received and needs the restock inspection checklist.",
                        href="/returns",
                        action_label="Inspect return",
                        created_at=record["requested_at"],
                    )
                )
            elif record["status"] == "inspected":
                notifications.append(
                    _notification(
                        id=f"return-restock-{record['id']}",
                        kind="return_restock",
                        severity="info",
                        title="Inspected return ready for next step",
                        message=f"{equipment} is inspected and should be restocked, closed, or routed to repair.",
                        href="/returns",
                        action_label="Update return",
                        created_at=record["requested_at"],
                    )
                )

    if user.app_role in {"admin", "dispatcher", "technician"}:
        tickets = (
            client.table("service_tickets")
            .select("id,priority,status,opened_at,equipment_id,patients(full_name),equipment(serial_number,make,model)")
            .order("opened_at", desc=True)
            .limit(100)
            .execute()
            .data
            or []
        )
        stale_cutoff = now - timedelta(days=5)
        active_ticket_equipment_ids: set[str] = set()
        for ticket in tickets:
            if ticket["status"] in TICKET_DONE_STATUSES:
                continue
            active_ticket_equipment_ids.add(ticket["equipment_id"])
            opened_at = _parse_date(ticket.get("opened_at"))
            equipment = _equipment_label(ticket)
            ticket_label = f"ticket {ticket['id'][:8]}"
            if ticket["priority"] == "urgent":
                notifications.append(
                    _notification(
                        id=f"ticket-urgent-{ticket['id']}",
                        kind="service_ticket",
                        severity="critical",
                        title="Urgent service ticket open",
                        message=f"{ticket_label} for {equipment} needs attention.",
                        href=f"/service-tickets/{ticket['id']}",
                        action_label="Open ticket",
                        created_at=ticket["opened_at"],
                    )
                )
            elif ticket["priority"] == "high":
                notifications.append(
                    _notification(
                        id=f"ticket-high-{ticket['id']}",
                        kind="service_ticket",
                        severity="warning",
                        title="High-priority service ticket open",
                        message=f"{ticket_label} for {equipment} is still active.",
                        href=f"/service-tickets/{ticket['id']}",
                        action_label="Open ticket",
                        created_at=ticket["opened_at"],
                    )
                )
            elif ticket["status"] == "waiting_parts" and opened_at and opened_at < stale_cutoff:
                notifications.append(
                    _notification(
                        id=f"ticket-waiting-parts-{ticket['id']}",
                        kind="service_ticket",
                        severity="warning",
                        title="Ticket waiting on parts",
                        message=f"{ticket_label} has been waiting on parts for {(now - opened_at).days} days.",
                        href=f"/service-tickets/{ticket['id']}",
                        action_label="Open ticket",
                        created_at=ticket["opened_at"],
                    )
                )

        in_repair = (
            client.table("equipment")
            .select("id,serial_number,make,model,updated_at")
            .eq("status", "in_repair")
            .limit(100)
            .execute()
            .data
            or []
        )
        for equipment in in_repair:
            if equipment["id"] in active_ticket_equipment_ids:
                continue
            notifications.append(
                _notification(
                    id=f"repair-no-ticket-{equipment['id']}",
                    kind="equipment_repair",
                    severity="warning",
                    title="Repair unit has no active ticket",
                    message=f"{equipment['serial_number']} - {equipment['make']} {equipment['model']} is marked in repair without an active ticket.",
                    href=f"/equipment/{equipment['id']}",
                    action_label="Open equipment",
                    created_at=equipment.get("updated_at") or now.isoformat(),
                )
            )

    try:
        message_notifications = _message_notifications(client, user.id)
        notifications.extend(message_notifications)
    except HTTPException as exc:
        if "message_" not in str(exc.detail).lower() and "messages" not in str(exc.detail).lower():
            raise

    notifications.sort(key=lambda item: (_severity_rank(item["severity"]), item["created_at"]), reverse=True)
    return {
        "items": notifications[:25],
        "counts": {
            "total": len(notifications),
            "critical": len([item for item in notifications if item["severity"] == "critical"]),
            "warning": len([item for item in notifications if item["severity"] == "warning"]),
            "info": len([item for item in notifications if item["severity"] == "info"]),
        },
    }


@router.get("/work-queue")
def work_queue(user: Annotated[AuthUser, Depends(get_current_user)]) -> dict[str, Any]:
    client = get_supabase()
    now = datetime.now(UTC)
    items: list[dict[str, Any]] = []

    if user.app_role in {"admin", "dispatcher"}:
        returns = (
            client.table("returns")
            .select("id,status,requested_at,scheduled_at,equipment_id,patient_id,patients(full_name),equipment(serial_number,make,model)")
            .order("requested_at", desc=True)
            .limit(200)
            .execute()
            .data
            or []
        )
        for record in returns:
            if record["status"] in RETURN_DONE_STATUSES:
                continue
            requested_at = _parse_date(record.get("requested_at"))
            if not requested_at:
                continue
            age_days = (now - requested_at).days
            if age_days < 3:
                continue
            patient = record.get("patients", {}).get("full_name") if record.get("patients") else "patient"
            items.append(
                _work_item(
                    id=f"return-{record['id']}",
                    kind="return",
                    severity="critical" if age_days >= 7 else "warning",
                    title="Return aging",
                    entity_label=_equipment_label(record),
                    detail=f"{patient} / status {record['status'].replace('_', ' ')}",
                    href="/returns",
                    age_days=age_days,
                    created_at=record["requested_at"],
                )
            )

    if user.app_role in {"admin", "dispatcher", "technician"}:
        tickets = (
            client.table("service_tickets")
            .select("id,ticket_number,priority,status,opened_at,equipment_id,patients(full_name),equipment(serial_number,make,model)")
            .order("opened_at", desc=True)
            .limit(200)
            .execute()
            .data
            or []
        )
        active_ticket_equipment_ids: set[str] = set()
        for ticket in tickets:
            if ticket["status"] in TICKET_DONE_STATUSES:
                continue
            active_ticket_equipment_ids.add(ticket["equipment_id"])
            opened_at = _parse_date(ticket.get("opened_at"))
            if not opened_at:
                continue
            age_days = (now - opened_at).days
            if age_days < 2 and ticket["priority"] not in {"urgent", "high"}:
                continue
            ticket_number = ticket.get("ticket_number") or f"ticket {ticket['id'][:8]}"
            severity = "critical" if ticket["priority"] == "urgent" or age_days >= 10 else "warning" if ticket["priority"] == "high" or age_days >= 5 else "info"
            items.append(
                _work_item(
                    id=f"ticket-{ticket['id']}",
                    kind="service_ticket",
                    severity=severity,
                    title=f"Service ticket aging: {ticket_number}",
                    entity_label=_equipment_label(ticket),
                    detail=f"{ticket['priority']} priority / status {ticket['status'].replace('_', ' ')}",
                    href=f"/service-tickets/{ticket['id']}",
                    age_days=age_days,
                    created_at=ticket["opened_at"],
                )
            )

        in_repair = (
            client.table("equipment")
            .select("id,serial_number,make,model,region,equipment_type,updated_at")
            .eq("status", "in_repair")
            .limit(200)
            .execute()
            .data
            or []
        )
        for equipment in in_repair:
            if equipment["id"] in active_ticket_equipment_ids:
                continue
            updated_at = _parse_date(equipment.get("updated_at")) or now
            items.append(
                _work_item(
                    id=f"repair-no-ticket-{equipment['id']}",
                    kind="repair_exception",
                    severity="warning",
                    title="Repair unit missing active ticket",
                    entity_label=f"{equipment['serial_number']} - {equipment['make']} {equipment['model']}",
                    detail=f"{equipment['region']} / {equipment['equipment_type'].replace('_', ' ')}",
                    href=f"/equipment/{equipment['id']}",
                    age_days=max(0, (now - updated_at).days),
                    created_at=equipment.get("updated_at") or now.isoformat(),
                )
            )

        try:
            maintenance = (
                client.table("preventive_maintenance_tasks")
                .select("id,task_type,status,priority,due_at,equipment_id,equipment(serial_number,make,model)")
                .in_("status", ["due", "scheduled"])
                .order("due_at", desc=False)
                .limit(200)
                .execute()
                .data
                or []
            )
            due_soon_cutoff = now + timedelta(days=7)
            for task in maintenance:
                due_at = _parse_date(task.get("due_at"))
                if not due_at or due_at > due_soon_cutoff:
                    continue
                age_days = (now - due_at).days
                overdue = age_days >= 0
                items.append(
                    _work_item(
                        id=f"maintenance-{task['id']}",
                        kind="maintenance",
                        severity="warning" if overdue else "info",
                        title="Preventive maintenance due" if overdue else "Preventive maintenance upcoming",
                        entity_label=_equipment_label(task),
                        detail=f"{task['task_type'].replace('_', ' ')} / {task['priority']} priority",
                        href="/repairs",
                        age_days=max(0, age_days),
                        created_at=task["due_at"],
                    )
                )
        except HTTPException as exc:
            if "preventive_maintenance_tasks" not in str(exc.detail).lower():
                raise

    items.sort(key=lambda item: (_severity_rank(item["severity"]), item["age_days"], item["created_at"]), reverse=True)
    return {
        "items": items[:80],
        "counts": {
            "total": len(items),
            "critical": len([item for item in items if item["severity"] == "critical"]),
            "warning": len([item for item in items if item["severity"] == "warning"]),
            "info": len([item for item in items if item["severity"] == "info"]),
        },
        "generated_at": now.isoformat(),
    }


def _notification(
    *,
    id: str,
    kind: str,
    severity: str,
    title: str,
    message: str,
    href: str,
    action_label: str,
    created_at: str,
) -> dict[str, str]:
    return {
        "id": id,
        "kind": kind,
        "severity": severity,
        "title": title,
        "message": message,
        "href": href,
        "action_label": action_label,
        "created_at": created_at,
    }


def _work_item(
    *,
    id: str,
    kind: str,
    severity: str,
    title: str,
    entity_label: str,
    detail: str,
    href: str,
    age_days: int,
    created_at: str,
) -> dict[str, Any]:
    return {
        "id": id,
        "kind": kind,
        "severity": severity,
        "title": title,
        "entity_label": entity_label,
        "detail": detail,
        "href": href,
        "age_days": age_days,
        "created_at": created_at,
    }


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _equipment_label(record: dict[str, Any]) -> str:
    equipment = record.get("equipment")
    if equipment:
        return f"{equipment['serial_number']} - {equipment['make']} {equipment['model']}"
    return f"equipment {record.get('equipment_id', '')}"


def _severity_rank(severity: str) -> int:
    return {"critical": 3, "warning": 2, "info": 1}.get(severity, 0)


def _message_notifications(client: Any, user_id: str) -> list[dict[str, str]]:
    memberships = (
        client.table("message_thread_members")
        .select("*")
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    notifications: list[dict[str, str]] = []
    for membership in memberships:
        thread_id = membership["thread_id"]
        query = (
            client.table("messages")
            .select("id,body,sender_id,created_at", count="exact")
            .eq("thread_id", thread_id)
            .neq("sender_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
        )
        if membership.get("last_read_at"):
            query = query.gt("created_at", membership["last_read_at"])
        response = query.execute()
        unread_count = response.count or 0
        latest = response.data[0] if response.data else None
        if not unread_count or not latest:
            continue
        sender = (
            client.table("profiles")
            .select("full_name")
            .eq("id", latest["sender_id"])
            .limit(1)
            .execute()
            .data
            or []
        )
        sender_name = sender[0]["full_name"] if sender else "A staff member"
        notifications.append(
            _notification(
                id=f"message-unread-{thread_id}",
                kind="message",
                severity="info",
                title=f"{unread_count} unread message{'s' if unread_count != 1 else ''}",
                message=f"{sender_name} sent you a message.",
                href=f"/messages?thread={thread_id}",
                action_label="Open messages",
                created_at=latest["created_at"],
            )
        )
    return notifications
