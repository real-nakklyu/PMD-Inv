from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.core.auth import AuthUser, get_current_user
from app.db.supabase import get_supabase

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("")
def list_activity(
    _: Annotated[AuthUser, Depends(get_current_user)],
    equipment_id: str | None = None,
    patient_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    query = get_supabase().table("activity_logs").select("*")
    if equipment_id:
        query = query.eq("equipment_id", equipment_id)
    if patient_id:
        query = query.eq("patient_id", patient_id)
    response = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return response.data or []
