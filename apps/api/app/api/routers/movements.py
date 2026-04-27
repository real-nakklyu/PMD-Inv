from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.auth import AuthUser, get_current_user, require_roles
from app.db.supabase import get_supabase
from app.schemas.movements import EquipmentMovementCreate, EquipmentMovementOut, EquipmentMovementType
from app.services.movements import record_equipment_movement

router = APIRouter(prefix="/equipment-movements", tags=["equipment movements"])


@router.get("", response_model=list[EquipmentMovementOut])
def list_equipment_movements(
    _: Annotated[AuthUser, Depends(get_current_user)],
    equipment_id: str | None = None,
    patient_id: str | None = None,
    movement_type: Annotated[EquipmentMovementType | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    query = get_supabase().table("equipment_movements").select(
        "*, equipment(serial_number,make,model,equipment_type,status,region), patients(full_name,date_of_birth,region)"
    )
    if equipment_id:
        query = query.eq("equipment_id", equipment_id)
    if patient_id:
        query = query.eq("patient_id", patient_id)
    if movement_type:
        query = query.eq("movement_type", movement_type)
    return query.order("moved_at", desc=True).range(offset, offset + limit - 1).execute().data or []


@router.post("", response_model=EquipmentMovementOut, status_code=201)
def create_equipment_movement(
    payload: EquipmentMovementCreate,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher", "technician"))],
):
    movement = record_equipment_movement(
        get_supabase(),
        actor_id=user.id,
        payload=payload.model_dump(mode="json", exclude_none=True),
    )
    return movement
