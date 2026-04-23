from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi import status as http_status

from app.core.auth import AuthUser, get_current_user, require_roles
from app.db.supabase import get_supabase
from app.repositories.simple import ReturnRepository
from app.schemas.workflows import ReturnCreate, ReturnInspectionUpdate, ReturnOut, ReturnStatusUpdate
from app.services.workflows import WorkflowService, now_iso

router = APIRouter(prefix="/returns", tags=["returns"])


@router.get("")
def list_returns(_: Annotated[AuthUser, Depends(get_current_user)], limit: int = 50, offset: int = 0):
    repo = ReturnRepository(get_supabase())
    response = (
        repo.table.select("*, patients(full_name,date_of_birth,region), equipment(serial_number,make,model,equipment_type,status)")
        .order("requested_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return response.data or []


@router.get("/{return_id}")
def get_return(return_id: str, _: Annotated[AuthUser, Depends(get_current_user)]):
    response = (
        get_supabase()
        .table("returns")
        .select("*, patients(full_name,date_of_birth,region), equipment(serial_number,make,model,equipment_type,status)")
        .eq("id", return_id)
        .single()
        .execute()
    )
    return response.data


@router.post("", response_model=ReturnOut, status_code=201)
def create_return(payload: ReturnCreate, user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher"))]):
    return WorkflowService(get_supabase()).create_return(payload.model_dump(mode="json"), actor_id=user.id)


@router.patch("/{return_id}/status", response_model=ReturnOut)
def update_return_status(
    return_id: str,
    payload: ReturnStatusUpdate,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher"))],
):
    return WorkflowService(get_supabase()).update_return_status(
        return_id,
        payload.status,
        actor_id=user.id,
        note=payload.notes,
    )


@router.get("/{return_id}/inspection")
def get_return_inspection(return_id: str, _: Annotated[AuthUser, Depends(get_current_user)]):
    client = get_supabase()
    response = client.table("return_inspections").select("*").eq("return_id", return_id).limit(1).execute()
    return response.data[0] if response.data else None


@router.put("/{return_id}/inspection")
def upsert_return_inspection(
    return_id: str,
    payload: ReturnInspectionUpdate,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher", "technician"))],
):
    client = get_supabase()
    return_record = ReturnRepository(client).get(return_id)
    existing = client.table("return_inspections").select("*").eq("return_id", return_id).limit(1).execute()
    data = {
        **payload.model_dump(mode="json"),
        "return_id": return_id,
        "equipment_id": return_record["equipment_id"],
        "completed_by": user.id if payload.approved_for_restock else None,
        "completed_at": now_iso() if payload.approved_for_restock else None,
    }
    if existing.data:
        response = client.table("return_inspections").update(data).eq("id", existing.data[0]["id"]).execute()
    else:
        response = client.table("return_inspections").insert(data).execute()
    return response.data[0]


@router.delete("/{return_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_return(return_id: str, _: Annotated[AuthUser, Depends(require_roles("admin"))]):
    client = get_supabase()
    client.table("return_inspections").delete().eq("return_id", return_id).execute()
    client.table("activity_logs").delete().eq("return_id", return_id).execute()
    ReturnRepository(client).delete(return_id)
