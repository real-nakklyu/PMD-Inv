from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi import status as http_status

from app.core.auth import AuthUser, get_current_user, require_roles
from app.db.supabase import SupabaseRestClient, get_supabase
from app.repositories.simple import PreventiveMaintenanceRepository
from app.schemas.maintenance import (
    MaintenanceTaskStatus,
    PreventiveMaintenanceCreate,
    PreventiveMaintenanceOut,
    PreventiveMaintenanceUpdate,
)

router = APIRouter(prefix="/maintenance", tags=["preventive maintenance"])


@router.get("", response_model=list[PreventiveMaintenanceOut])
def list_maintenance_tasks(
    _: Annotated[AuthUser, Depends(get_current_user)],
    equipment_id: str | None = None,
    status: MaintenanceTaskStatus | None = None,
    limit: int = 100,
    offset: int = 0,
):
    query = get_supabase().table("preventive_maintenance_tasks").select(
        "*, equipment(serial_number,make,model,equipment_type,status,region), service_tickets(ticket_number,status,priority)"
    )
    if equipment_id:
        query = query.eq("equipment_id", equipment_id)
    if status:
        query = query.eq("status", status)
    return query.order("due_at", desc=False).range(offset, offset + limit - 1).execute().data or []


@router.post("", response_model=PreventiveMaintenanceOut, status_code=http_status.HTTP_201_CREATED)
def create_maintenance_task(
    payload: PreventiveMaintenanceCreate,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher", "technician"))],
):
    client = get_supabase()
    record = PreventiveMaintenanceRepository(client).create({
        **payload.model_dump(mode="json"),
        "created_by": user.id,
    })
    _log_maintenance_activity(
        client,
        event_type="maintenance_created",
        actor_id=user.id,
        equipment_id=record["equipment_id"],
        message=f"Preventive maintenance created: {record['task_type'].replace('_', ' ')}.",
    )
    return record


@router.patch("/{task_id}", response_model=PreventiveMaintenanceOut)
def update_maintenance_task(
    task_id: str,
    payload: PreventiveMaintenanceUpdate,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher", "technician"))],
):
    client = get_supabase()
    before_response = client.table("preventive_maintenance_tasks").select("*").eq("id", task_id).single().execute()
    before = before_response.data
    if not before:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Maintenance task not found.")

    data = payload.model_dump(mode="json", exclude_unset=True)
    if data.get("status") == "completed":
      data.setdefault("completed_at", datetime.now(timezone.utc).isoformat())
      data["completed_by"] = user.id

    record = PreventiveMaintenanceRepository(client).update(task_id, data)
    event_type = "maintenance_completed" if record.get("status") == "completed" and before.get("status") != "completed" else "maintenance_status_changed"
    _log_maintenance_activity(
        client,
        event_type=event_type,
        actor_id=user.id,
        equipment_id=record["equipment_id"],
        message=f"Preventive maintenance {record['status'].replace('_', ' ')}: {record['task_type'].replace('_', ' ')}.",
    )
    return record


@router.delete("/{task_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_maintenance_task(task_id: str, _: Annotated[AuthUser, Depends(require_roles("admin"))]):
    PreventiveMaintenanceRepository(get_supabase()).delete(task_id)


def _log_maintenance_activity(client: SupabaseRestClient, *, event_type: str, actor_id: str, equipment_id: str, message: str) -> None:
    try:
        client.table("activity_logs").insert(
            {
                "event_type": event_type,
                "actor_id": actor_id,
                "equipment_id": equipment_id,
                "message": message,
            }
        ).execute()
    except HTTPException as exc:
        if "invalid input value for enum activity_event_type" not in str(exc.detail):
            raise
