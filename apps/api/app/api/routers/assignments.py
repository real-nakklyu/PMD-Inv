from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.auth import AuthUser, get_current_user, require_roles
from app.db.supabase import get_supabase
from app.repositories.simple import AssignmentRepository
from app.schemas.common import AssignmentStatus
from app.schemas.workflows import AssignmentCreate, AssignmentOut
from app.services.workflows import WorkflowService

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.get("")
def list_assignments(
    _: Annotated[AuthUser, Depends(get_current_user)],
    status: Annotated[AssignmentStatus | None, Query()] = None,
    limit: int = 50,
    offset: int = 0,
):
    repo = AssignmentRepository(get_supabase())
    select = "*, patients(full_name,date_of_birth,region), equipment(serial_number,make,model,equipment_type,status)"
    if not status:
        response = (
            repo.table.select(select)
            .order("assigned_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return response.data or []
    response = (
        repo.table.select(select)
        .eq("status", status)
        .order("assigned_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    rows = response.data or []
    if status == "active":
        rows = [
            row
            for row in rows
            if (row.get("equipment") or {}).get("status") in {"assigned", "return_in_progress"}
        ]
    return rows


@router.post("", response_model=AssignmentOut, status_code=201)
def create_assignment(payload: AssignmentCreate, user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher"))]):
    service = WorkflowService(get_supabase())
    return service.create_assignment(payload.model_dump(mode="json"), actor_id=user.id)
