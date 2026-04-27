from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi import status as http_status

from app.core.auth import AuthUser, get_current_user, require_roles
from app.db.supabase import get_supabase
from app.repositories.simple import PatientRepository
from app.schemas.common import florida_regions
from app.schemas.patient import PatientCreate, PatientOut, PatientUpdate
from app.services.audit import log_change_activity

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=list[PatientOut])
def list_patients(
    _: Annotated[AuthUser, Depends(get_current_user)],
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    repo = PatientRepository(get_supabase())
    query = repo.table.select("*").is_("archived_at", "null")
    if search:
        term = search.replace(",", " ").strip()
        matching_regions = [region for region in florida_regions if term.lower() in region.lower()]
        expressions = [f"full_name.ilike.*{term}*"]
        if matching_regions:
            expressions.extend([f"region.eq.{region}" for region in matching_regions])
        query = query.or_(",".join(expressions))
    response = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return response.data or []


@router.get("/{patient_id}/detail")
def get_patient_detail(patient_id: str, _: Annotated[AuthUser, Depends(get_current_user)]):
    client = get_supabase()
    patient = PatientRepository(client).get(patient_id)
    assignments = (
        client.table("assignments")
        .select("*, equipment(serial_number,make,model,equipment_type,status,region)")
        .eq("patient_id", patient_id)
        .order("assigned_at", desc=True)
        .execute()
        .data
        or []
    )
    returns = (
        client.table("returns")
        .select("*, equipment(serial_number,make,model,equipment_type,status,region)")
        .eq("patient_id", patient_id)
        .order("requested_at", desc=True)
        .execute()
        .data
        or []
    )
    tickets = (
        client.table("service_tickets")
        .select("*, equipment(serial_number,make,model,equipment_type,status,region)")
        .eq("patient_id", patient_id)
        .order("opened_at", desc=True)
        .execute()
        .data
        or []
    )
    activity = (
        client.table("activity_logs")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .limit(25)
        .execute()
        .data
        or []
    )
    return {
        "patient": patient,
        "assignments": assignments,
        "returns": returns,
        "service_tickets": tickets,
        "activity": activity,
    }


@router.post("", response_model=PatientOut, status_code=201)
def create_patient(payload: PatientCreate, user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher"))]):
    return PatientRepository(get_supabase()).create({**payload.model_dump(mode="json"), "created_by": user.id})


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: str, _: Annotated[AuthUser, Depends(get_current_user)]):
    return PatientRepository(get_supabase()).get(patient_id)


@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: str,
    payload: PatientUpdate,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher"))],
):
    client = get_supabase()
    repo = PatientRepository(client)
    before = repo.get(patient_id)
    data = payload.model_dump(mode="json", exclude_unset=True)
    updated = repo.update(patient_id, data)
    log_change_activity(
        client,
        event_type="patient_edited",
        actor_id=user.id,
        patient_id=patient_id,
        before=before,
        after=updated,
        fields=list(data.keys()),
        message=f"Patient {updated['full_name']} edited.",
    )
    return updated


@router.delete("/{patient_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_patient(patient_id: str, _: Annotated[AuthUser, Depends(require_roles("admin"))]):
    PatientRepository(get_supabase()).delete(patient_id)
