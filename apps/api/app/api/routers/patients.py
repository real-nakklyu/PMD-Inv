from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import AuthUser, get_current_user, require_roles
from app.db.supabase import get_supabase
from app.repositories.simple import PatientNoteRepository, PatientRepository
from app.schemas.common import florida_regions
from app.schemas.patient import PatientCreate, PatientNoteCreate, PatientNoteOut, PatientUpdate, PatientOut
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
        expressions = [
            f"full_name.ilike.*{term}*",
            f"address_line1.ilike.*{term}*",
            f"city.ilike.*{term}*",
            f"postal_code.ilike.*{term}*",
        ]
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
    try:
        patient_notes = _patient_notes_query(client, patient_id).execute().data or []
    except HTTPException as exc:
        if "patient_notes" not in str(exc.detail).lower():
            raise
        patient_notes = []
    return {
        "patient": patient,
        "assignments": assignments,
        "returns": returns,
        "service_tickets": tickets,
        "activity": activity,
        "patient_notes": [_normalize_patient_note(note) for note in patient_notes],
    }


@router.post("", response_model=PatientOut, status_code=201)
def create_patient(payload: PatientCreate, user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher"))]):
    return PatientRepository(get_supabase()).create({**payload.model_dump(mode="json"), "created_by": user.id})


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: str, _: Annotated[AuthUser, Depends(get_current_user)]):
    return PatientRepository(get_supabase()).get(patient_id)


@router.post("/{patient_id}/notes", response_model=PatientNoteOut, status_code=201)
def create_patient_note(
    patient_id: str,
    payload: PatientNoteCreate,
    user: Annotated[AuthUser, Depends(get_current_user)],
):
    client = get_supabase()
    patient = PatientRepository(client).get(patient_id)
    record = PatientNoteRepository(client).create(
        {
            "patient_id": patient_id,
            "body": payload.body.strip(),
            "created_by": user.id,
        }
    )
    _log_patient_note_activity(
        client,
        actor_id=user.id,
        patient_id=patient_id,
        patient_name=patient["full_name"],
    )
    notes = _patient_notes_query(client, patient_id).eq("id", record["id"]).limit(1).execute().data or []
    return _normalize_patient_note(notes[0] if notes else record)


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


@router.delete("/{patient_id}")
def delete_patient(patient_id: str, user: Annotated[AuthUser, Depends(require_roles("admin"))]):
    client = get_supabase()
    repo = PatientRepository(client)
    patient = repo.get(patient_id)
    dependency_counts = _patient_dependency_counts(client, patient_id)

    if any(dependency_counts.values()):
        _archive_patient(client, repo, patient, user.id)
        return {
            "action": "archived",
            "message": "Patient has workflow history, so they were archived instead of permanently deleted.",
        }

    try:
        repo.delete(patient_id)
    except HTTPException as exc:
        if "foreign key" not in str(exc.detail).lower():
            raise
        _archive_patient(client, repo, patient, user.id)
        return {
            "action": "archived",
            "message": "Patient was archived because related records still reference them.",
        }

    return {"action": "deleted", "message": "Patient permanently deleted."}


PATIENT_DEPENDENCY_TABLES = (
    "assignments",
    "returns",
    "service_tickets",
    "delivery_setup_checklists",
    "equipment_movements",
    "operational_appointments",
    "handoff_notes",
    "patient_notes",
    "activity_logs",
)


def _patient_dependency_counts(client, patient_id: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table_name in PATIENT_DEPENDENCY_TABLES:
        try:
            response = (
                client.table(table_name)
                .select("id", count="exact", head=True)
                .eq("patient_id", patient_id)
                .execute()
            )
        except HTTPException as exc:
            detail = str(exc.detail).lower()
            if "does not exist" in detail or "schema cache" in detail:
                counts[table_name] = 0
                continue
            raise
        counts[table_name] = response.count or 0
    return counts


def _archive_patient(client, repo: PatientRepository, patient: dict, actor_id: str) -> dict:
    archived_at = datetime.now(timezone.utc).isoformat()
    archived = repo.update(patient["id"], {"archived_at": archived_at})
    log_change_activity(
        client,
        event_type="patient_edited",
        actor_id=actor_id,
        patient_id=patient["id"],
        before=patient,
        after=archived,
        fields=["archived_at"],
        message=f"Patient {patient['full_name']} archived.",
    )
    return archived


def _patient_notes_query(client, patient_id: str):
    return (
        client.table("patient_notes")
        .select("*, created_by_profile:profiles!patient_notes_created_by_fkey(id,full_name,role)")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
    )


def _normalize_patient_note(record: dict) -> dict:
    record["profiles"] = record.pop("created_by_profile", None)
    return record


def _log_patient_note_activity(client, *, actor_id: str, patient_id: str, patient_name: str) -> None:
    try:
        client.table("activity_logs").insert(
            {
                "event_type": "patient_note_added",
                "actor_id": actor_id,
                "patient_id": patient_id,
                "message": f"Patient note added for {patient_name}.",
            }
        ).execute()
    except HTTPException as exc:
        if "invalid input value for enum activity_event_type" not in str(exc.detail).lower():
            raise
