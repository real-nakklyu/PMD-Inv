from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import AuthUser, get_current_user, require_roles
from app.db.supabase import get_supabase
from app.repositories.equipment import EquipmentRepository
from app.schemas.common import EquipmentStatus, EquipmentType, FloridaRegion
from app.schemas.equipment import EquipmentCreate, EquipmentListOut, EquipmentOut, EquipmentUpdate
from app.services.audit import log_change_activity

router = APIRouter(prefix="/equipment", tags=["equipment"])


@router.get("", response_model=list[EquipmentOut])
def list_equipment(
    _: Annotated[AuthUser, Depends(get_current_user)],
    search: str | None = None,
    status: Annotated[EquipmentStatus | None, Query()] = None,
    region: Annotated[FloridaRegion | None, Query()] = None,
    equipment_type: Annotated[EquipmentType | None, Query()] = None,
    limit: int = 50,
    offset: int = 0,
):
    repo = EquipmentRepository(get_supabase())
    return repo.list_filtered(
        search=search,
        status_value=status,
        region=region,
        equipment_type=equipment_type,
        limit=limit,
        offset=offset,
    )


@router.get("/page", response_model=EquipmentListOut)
def list_equipment_page(
    _: Annotated[AuthUser, Depends(get_current_user)],
    search: str | None = None,
    status: Annotated[EquipmentStatus | None, Query()] = None,
    region: Annotated[FloridaRegion | None, Query()] = None,
    equipment_type: Annotated[EquipmentType | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    repo = EquipmentRepository(get_supabase())
    return repo.list_filtered_page(
        search=search,
        status_value=status,
        region=region,
        equipment_type=equipment_type,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=EquipmentOut, status_code=201)
def create_equipment(payload: EquipmentCreate, user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher"))]):
    repo = EquipmentRepository(get_supabase())
    repo.ensure_serial_available(payload.serial_number)
    record = payload.model_dump(mode="json")
    return repo.create({**record, "created_by": user.id})


@router.get("/{equipment_id}/detail")
def get_equipment_detail(
    equipment_id: str,
    _: Annotated[AuthUser, Depends(get_current_user)],
) -> dict[str, Any]:
    client = get_supabase()
    equipment = EquipmentRepository(client).get(equipment_id)
    assignments = (
        client.table("assignments")
        .select("*, patients(full_name,date_of_birth,region)")
        .eq("equipment_id", equipment_id)
        .order("assigned_at", desc=True)
        .execute()
        .data
        or []
    )
    returns = (
        client.table("returns")
        .select("*, patients(full_name,date_of_birth,region)")
        .eq("equipment_id", equipment_id)
        .order("requested_at", desc=True)
        .execute()
        .data
        or []
    )
    tickets = (
        client.table("service_tickets")
        .select("*, service_ticket_updates(*)")
        .eq("equipment_id", equipment_id)
        .order("opened_at", desc=True)
        .execute()
        .data
        or []
    )
    activity = (
        client.table("activity_logs")
        .select("*")
        .eq("equipment_id", equipment_id)
        .order("created_at", desc=True)
        .limit(25)
        .execute()
        .data
        or []
    )
    try:
        movements = (
            client.table("equipment_movements")
            .select("*, patients(full_name,date_of_birth,region)")
            .eq("equipment_id", equipment_id)
            .order("moved_at", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )
    except HTTPException as exc:
        if "equipment_movements" not in str(exc.detail).lower():
            raise
        movements = []
    try:
        maintenance = (
            client.table("preventive_maintenance_tasks")
            .select("*, service_tickets(ticket_number,status,priority)")
            .eq("equipment_id", equipment_id)
            .order("due_at", desc=False)
            .limit(50)
            .execute()
            .data
            or []
        )
    except HTTPException as exc:
        if "preventive_maintenance_tasks" not in str(exc.detail).lower():
            raise
        maintenance = []
    try:
        cost_events = (
            client.table("equipment_cost_events")
            .select("*, service_tickets(ticket_number,status,priority)")
            .eq("equipment_id", equipment_id)
            .order("occurred_at", desc=True)
            .limit(100)
            .execute()
            .data
            or []
        )
    except HTTPException as exc:
        if "equipment_cost_events" not in str(exc.detail).lower():
            raise
        cost_events = []
    repair_count = len(
        [
            ticket
            for ticket in tickets
            if ticket.get("repair_completed") and ticket.get("status") in {"resolved", "closed"}
        ]
    )
    return {
        "equipment": equipment,
        "assignments": assignments,
        "returns": returns,
        "service_tickets": tickets,
        "activity": activity,
        "movements": movements,
        "maintenance": maintenance,
        "cost_events": cost_events,
        "repair_count": repair_count,
    }


@router.get("/{equipment_id}", response_model=EquipmentOut)
def get_equipment(equipment_id: str, _: Annotated[AuthUser, Depends(get_current_user)]):
    return EquipmentRepository(get_supabase()).get(equipment_id)


@router.patch("/{equipment_id}", response_model=EquipmentOut)
def update_equipment(
    equipment_id: str,
    payload: EquipmentUpdate,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher"))],
):
    client = get_supabase()
    repo = EquipmentRepository(client)
    before = repo.get(equipment_id)
    data = payload.model_dump(mode="json", exclude_unset=True)
    if "serial_number" in data:
        repo.ensure_serial_available(data["serial_number"], exclude_id=equipment_id)
    updated = repo.update(equipment_id, data)
    log_change_activity(
        client,
        event_type="equipment_edited",
        actor_id=user.id,
        equipment_id=equipment_id,
        before=before,
        after=updated,
        fields=list(data.keys()),
        message=f"Equipment {updated['serial_number']} edited.",
    )
    return updated


@router.delete("/{equipment_id}")
def delete_equipment(equipment_id: str, user: Annotated[AuthUser, Depends(require_roles("admin"))]) -> dict[str, str]:
    client = get_supabase()
    repo = EquipmentRepository(client)
    before = repo.get(equipment_id)
    dependency_counts = _equipment_dependency_counts(client, equipment_id)
    has_workflow_history = any(dependency_counts.values())

    if has_workflow_history:
        now = datetime.now(timezone.utc).isoformat()
        ended_assignment_count = _end_active_assignments_for_equipment(client, equipment_id, ended_at=now)
        archived = repo.update(
            equipment_id,
            {
                "status": "retired",
                "assigned_at": None,
                "archived_at": now,
            },
        )
        log_change_activity(
            client,
            event_type="equipment_edited",
            actor_id=user.id,
            equipment_id=equipment_id,
            before=before,
            after=archived,
            fields=["status", "assigned_at", "archived_at"],
            message=f"Equipment {archived['serial_number']} retired and archived. {_assignment_count_label(ended_assignment_count)} ended.",
        )
        return {"action": "archived", "message": "Equipment has workflow history, so it was retired and archived instead of hard-deleted. Active assignments were ended."}

    try:
        repo.delete(equipment_id)
    except HTTPException as exc:
        if "foreign key" not in str(exc.detail).lower():
            raise
        now = datetime.now(timezone.utc).isoformat()
        ended_assignment_count = _end_active_assignments_for_equipment(client, equipment_id, ended_at=now)
        archived = repo.update(
            equipment_id,
            {
                "status": "retired",
                "assigned_at": None,
                "archived_at": now,
            },
        )
        log_change_activity(
            client,
            event_type="equipment_edited",
            actor_id=user.id,
            equipment_id=equipment_id,
            before=before,
            after=archived,
            fields=["status", "assigned_at", "archived_at"],
            message=f"Equipment {archived['serial_number']} retired and archived. {_assignment_count_label(ended_assignment_count)} ended.",
        )
        return {"action": "archived", "message": "Equipment was retired and archived because related records still reference it. Active assignments were ended."}

    return {"action": "deleted", "message": "Equipment permanently deleted."}


def _equipment_dependency_counts(client: Any, equipment_id: str) -> dict[str, int]:
    related_tables = [
        "assignments",
        "returns",
        "service_tickets",
        "delivery_setup_checklists",
        "equipment_movements",
        "preventive_maintenance_tasks",
        "equipment_cost_events",
    ]
    counts: dict[str, int] = {}
    for table_name in related_tables:
        try:
            response = (
                client.table(table_name)
                .select("id", count="exact", head=True)
                .eq("equipment_id", equipment_id)
                .execute()
            )
        except HTTPException as exc:
            if "does not exist" not in str(exc.detail).lower():
                raise
            counts[table_name] = 0
            continue
        counts[table_name] = response.count or 0
    return counts


def _end_active_assignments_for_equipment(client: Any, equipment_id: str, *, ended_at: str) -> int:
    active_assignments = (
        client.table("assignments")
        .select("id")
        .eq("equipment_id", equipment_id)
        .in_("status", ["active", "return_in_progress"])
        .execute()
        .data
        or []
    )
    for assignment in active_assignments:
        client.table("assignments").update({"status": "ended", "ended_at": ended_at}).eq("id", assignment["id"]).execute()
    return len(active_assignments)


def _assignment_count_label(count: int) -> str:
    return f"{count} active {'assignment' if count == 1 else 'assignments'}"
