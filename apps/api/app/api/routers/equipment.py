from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from fastapi import status as http_status

from app.core.auth import AuthUser, get_current_user, require_roles
from app.db.supabase import get_supabase
from app.repositories.equipment import EquipmentRepository
from app.schemas.common import EquipmentStatus, EquipmentType, FloridaRegion
from app.schemas.equipment import EquipmentCreate, EquipmentListOut, EquipmentOut, EquipmentUpdate

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
        "repair_count": repair_count,
    }


@router.get("/{equipment_id}", response_model=EquipmentOut)
def get_equipment(equipment_id: str, _: Annotated[AuthUser, Depends(get_current_user)]):
    return EquipmentRepository(get_supabase()).get(equipment_id)


@router.patch("/{equipment_id}", response_model=EquipmentOut)
def update_equipment(
    equipment_id: str,
    payload: EquipmentUpdate,
    _: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher"))],
):
    repo = EquipmentRepository(get_supabase())
    data = payload.model_dump(mode="json", exclude_unset=True)
    if "serial_number" in data:
        repo.ensure_serial_available(data["serial_number"], exclude_id=equipment_id)
    return repo.update(equipment_id, data)


@router.delete("/{equipment_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_equipment(equipment_id: str, _: Annotated[AuthUser, Depends(require_roles("admin"))]):
    EquipmentRepository(get_supabase()).delete(equipment_id)
