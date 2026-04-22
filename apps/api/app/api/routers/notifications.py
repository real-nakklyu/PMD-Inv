from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends

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
