from app.api.routers.patients import _normalize_patient_note
from app.schemas.patient import PatientNoteCreate


def test_patient_note_create_trims_body():
    payload = PatientNoteCreate(body="  Delivered charger reminder.  ")

    assert payload.body == "Delivered charger reminder."


def test_patient_note_normalization_maps_created_by_profile():
    record = {
        "id": "note-1",
        "body": "Needs afternoon calls.",
        "created_by_profile": {"full_name": "Sam Dispatcher", "role": "dispatcher"},
    }

    normalized = _normalize_patient_note(record)

    assert normalized["profiles"] == {"full_name": "Sam Dispatcher", "role": "dispatcher"}
    assert "created_by_profile" not in normalized
