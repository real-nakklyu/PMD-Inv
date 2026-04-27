from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as http_status

from app.core.auth import AuthUser, get_current_user, require_roles
from app.db.supabase import SupabaseRestClient, get_supabase
from app.repositories.simple import HandoffNoteRepository
from app.schemas.common import FloridaRegion
from app.schemas.handoff import HandoffNoteCreate, HandoffNoteOut, HandoffNoteStatus, HandoffNoteType, HandoffNoteUpdate

router = APIRouter(prefix="/handoff-notes", tags=["handoff notes"])


@router.get("", response_model=list[HandoffNoteOut])
def list_handoff_notes(
    _: Annotated[AuthUser, Depends(get_current_user)],
    status: Annotated[HandoffNoteStatus | None, Query()] = None,
    note_type: Annotated[HandoffNoteType | None, Query()] = None,
    region: Annotated[FloridaRegion | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    query = get_supabase().table("handoff_notes").select(
        "*, created_by_profile:profiles!handoff_notes_created_by_fkey(full_name,role), equipment(serial_number,make,model,status,region), patients(full_name,date_of_birth,region)"
    )
    if status:
        query = query.eq("status", status)
    if note_type:
        query = query.eq("note_type", note_type)
    if region:
        query = query.eq("region", region)
    records = query.order("updated_at", desc=True).range(offset, offset + limit - 1).execute().data or []
    return [_normalize_handoff_note(record) for record in records]


@router.post("", response_model=HandoffNoteOut, status_code=http_status.HTTP_201_CREATED)
def create_handoff_note(payload: HandoffNoteCreate, user: Annotated[AuthUser, Depends(get_current_user)]):
    client = get_supabase()
    record = HandoffNoteRepository(client).create({**payload.model_dump(mode="json", exclude_none=True), "created_by": user.id})
    _log_handoff_activity(
        client,
        event_type="handoff_note_created",
        actor_id=user.id,
        equipment_id=record.get("equipment_id"),
        patient_id=record.get("patient_id"),
        message=f"Handoff note created: {record['title']}.",
    )
    return record


@router.patch("/{note_id}", response_model=HandoffNoteOut)
def update_handoff_note(note_id: str, payload: HandoffNoteUpdate, user: Annotated[AuthUser, Depends(get_current_user)]):
    client = get_supabase()
    data = payload.model_dump(mode="json", exclude_unset=True)
    before = HandoffNoteRepository(client).get(note_id)
    if data.get("status") == "resolved" and before.get("status") != "resolved":
        data["resolved_by"] = user.id
        data["resolved_at"] = datetime.now(timezone.utc).isoformat()
    record = HandoffNoteRepository(client).update(note_id, data)
    if record.get("status") == "resolved" and before.get("status") != "resolved":
        _log_handoff_activity(
            client,
            event_type="handoff_note_resolved",
            actor_id=user.id,
            equipment_id=record.get("equipment_id"),
            patient_id=record.get("patient_id"),
            message=f"Handoff note resolved: {record['title']}.",
        )
    return record


@router.delete("/{note_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_handoff_note(note_id: str, _: Annotated[AuthUser, Depends(require_roles("admin"))]):
    HandoffNoteRepository(get_supabase()).delete(note_id)


def _log_handoff_activity(client: SupabaseRestClient, *, event_type: str, actor_id: str, equipment_id: str | None, patient_id: str | None, message: str) -> None:
    try:
        client.table("activity_logs").insert(
            {
                "event_type": event_type,
                "actor_id": actor_id,
                "equipment_id": equipment_id,
                "patient_id": patient_id,
                "message": message,
            }
        ).execute()
    except HTTPException as exc:
        if "invalid input value for enum activity_event_type" not in str(exc.detail):
            raise


def _normalize_handoff_note(record: dict) -> dict:
    record["profiles"] = record.pop("created_by_profile", None)
    return record
