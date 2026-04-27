from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.core.auth import AuthUser, get_current_user
from app.db.supabase import get_supabase

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def global_search(
    _: Annotated[AuthUser, Depends(get_current_user)],
    q: Annotated[str, Query(min_length=2, max_length=120)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict[str, Any]:
    client = get_supabase()
    query = q.strip()
    pattern = f"%{query}%"
    lowered = query.lower()
    results: list[dict[str, Any]] = []

    equipment = (
        client.table("equipment")
        .select("id,serial_number,make,model,status,region,equipment_type")
        .is_("archived_at", "null")
        .or_(f"serial_number.ilike.{pattern},make.ilike.{pattern},model.ilike.{pattern}")
        .limit(8)
        .execute()
        .data
        or []
    )
    for item in equipment:
        results.append(
            _result(
                kind="equipment",
                title=f"{item['serial_number']} - {item['make']} {item['model']}",
                subtitle=f"{item['region']} / {item['equipment_type'].replace('_', ' ')} / {item['status'].replace('_', ' ')}",
                href=f"/equipment/{item['id']}",
                metadata={"status": item["status"], "region": item["region"]},
            )
        )

    patients = (
        client.table("patients")
        .select("id,full_name,date_of_birth,region")
        .is_("archived_at", "null")
        .ilike("full_name", pattern)
        .limit(8)
        .execute()
        .data
        or []
    )
    for patient in patients:
        results.append(
            _result(
                kind="patient",
                title=patient["full_name"],
                subtitle=f"DOB {patient['date_of_birth']} / {patient['region']}",
                href=f"/patients/{patient['id']}",
                metadata={"region": patient["region"]},
            )
        )

    tickets = (
        client.table("service_tickets")
        .select("id,ticket_number,priority,status,issue_description,equipment(serial_number,make,model),patients(full_name)")
        .or_(f"ticket_number.ilike.{pattern},issue_description.ilike.{pattern}")
        .limit(8)
        .execute()
        .data
        or []
    )
    for ticket in tickets:
        equipment_label = _equipment_label(ticket)
        patient_name = ticket.get("patients", {}).get("full_name") if ticket.get("patients") else None
        results.append(
            _result(
                kind="service_ticket",
                title=ticket.get("ticket_number") or f"Ticket {ticket['id'][:8]}",
                subtitle=f"{ticket['priority']} / {ticket['status']} / {equipment_label}{f' / {patient_name}' if patient_name else ''}",
                href=f"/service-tickets/{ticket['id']}",
                metadata={"status": ticket["status"], "priority": ticket["priority"]},
            )
        )

    returns = (
        client.table("returns")
        .select("id,status,requested_at,equipment(serial_number,make,model),patients(full_name)")
        .order("requested_at", desc=True)
        .limit(100)
        .execute()
        .data
        or []
    )
    for record in returns:
        searchable = f"{record.get('status', '')} {_equipment_label(record)} {record.get('patients', {}).get('full_name') if record.get('patients') else ''}".lower()
        if lowered not in searchable:
            continue
        results.append(
            _result(
                kind="return",
                title=f"Return: {_equipment_label(record)}",
                subtitle=f"{record['status'].replace('_', ' ')} / requested {record['requested_at'][:10]}",
                href="/returns",
                metadata={"status": record["status"]},
            )
        )
        if len([item for item in results if item["kind"] == "return"]) >= 5:
            break

    assignments = (
        client.table("assignments")
        .select("id,status,assigned_at,region,equipment(serial_number,make,model),patients(full_name,date_of_birth)")
        .order("assigned_at", desc=True)
        .limit(100)
        .execute()
        .data
        or []
    )
    for assignment in assignments:
        searchable = f"{assignment.get('status', '')} {assignment.get('region', '')} {_equipment_label(assignment)} {assignment.get('patients', {}).get('full_name') if assignment.get('patients') else ''}".lower()
        if lowered not in searchable:
            continue
        patient_name = assignment.get("patients", {}).get("full_name") if assignment.get("patients") else "patient"
        results.append(
            _result(
                kind="assignment",
                title=f"Assignment: {patient_name}",
                subtitle=f"{_equipment_label(assignment)} / {assignment['region']} / {assignment['status']}",
                href="/assigned",
                metadata={"status": assignment["status"], "region": assignment["region"]},
            )
        )
        if len([item for item in results if item["kind"] == "assignment"]) >= 5:
            break

    appointments = (
        client.table("operational_appointments")
        .select("id,title,kind,status,region,scheduled_start,equipment(serial_number,make,model),patients(full_name)")
        .order("scheduled_start", desc=False)
        .limit(100)
        .execute()
        .data
        or []
    )
    for appointment in appointments:
        searchable = f"{appointment.get('title', '')} {appointment.get('kind', '')} {appointment.get('status', '')} {appointment.get('region', '')} {_equipment_label(appointment)} {appointment.get('patients', {}).get('full_name') if appointment.get('patients') else ''}".lower()
        if lowered not in searchable:
            continue
        results.append(
            _result(
                kind="appointment",
                title=appointment["title"],
                subtitle=f"{appointment['kind']} / {appointment['status']} / {appointment['region']} / {appointment['scheduled_start'][:16]}",
                href="/schedule",
                metadata={"status": appointment["status"], "region": appointment["region"]},
            )
        )
        if len([item for item in results if item["kind"] == "appointment"]) >= 5:
            break

    return {"query": query, "results": results[:limit]}


def _result(*, kind: str, title: str, subtitle: str, href: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "id": f"{kind}:{href}:{title}",
        "kind": kind,
        "title": title,
        "subtitle": subtitle,
        "href": href,
        "metadata": metadata or {},
    }


def _equipment_label(record: dict[str, Any]) -> str:
    equipment = record.get("equipment")
    if not equipment:
        return "equipment"
    return f"{equipment['serial_number']} - {equipment['make']} {equipment['model']}"
