from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as http_status

from app.core.auth import AuthUser, get_current_user, require_roles
from app.db.supabase import SupabaseRestClient, get_supabase
from app.repositories.simple import EquipmentCostEventRepository
from app.schemas.costs import EquipmentCostEventCreate, EquipmentCostEventOut, EquipmentCostEventType

router = APIRouter(prefix="/cost-events", tags=["equipment cost events"])


@router.get("", response_model=list[EquipmentCostEventOut])
def list_cost_events(
    _: Annotated[AuthUser, Depends(get_current_user)],
    equipment_id: str | None = None,
    event_type: Annotated[EquipmentCostEventType | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    query = get_supabase().table("equipment_cost_events").select(
        "*, equipment(serial_number,make,model,equipment_type,status,region), service_tickets(ticket_number,status,priority)"
    )
    if equipment_id:
        query = query.eq("equipment_id", equipment_id)
    if event_type:
        query = query.eq("event_type", event_type)
    return query.order("occurred_at", desc=True).range(offset, offset + limit - 1).execute().data or []


@router.post("", response_model=EquipmentCostEventOut, status_code=http_status.HTTP_201_CREATED)
def create_cost_event(
    payload: EquipmentCostEventCreate,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher"))],
):
    client = get_supabase()
    record = EquipmentCostEventRepository(client).create({
        **payload.model_dump(mode="json", exclude_none=True),
        "created_by": user.id,
    })
    _log_cost_activity(
        client,
        event_type="cost_event_created",
        actor_id=user.id,
        equipment_id=record["equipment_id"],
        message=f"Cost event recorded: {record['event_type'].replace('_', ' ')} for ${record['amount']}.",
    )
    return record


@router.delete("/{event_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_cost_event(event_id: str, user: Annotated[AuthUser, Depends(require_roles("admin"))]):
    client = get_supabase()
    record = EquipmentCostEventRepository(client).get(event_id)
    EquipmentCostEventRepository(client).delete(event_id)
    _log_cost_activity(
        client,
        event_type="cost_event_deleted",
        actor_id=user.id,
        equipment_id=record["equipment_id"],
        message=f"Cost event deleted: {record['event_type'].replace('_', ' ')} for ${record['amount']}.",
    )


def _log_cost_activity(client: SupabaseRestClient, *, event_type: str, actor_id: str, equipment_id: str, message: str) -> None:
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
