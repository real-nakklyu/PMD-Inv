from app.api.routers.corrections import _append_note, _assignment_search_text


def test_append_note_preserves_existing_notes():
    result = _append_note("existing", "admin_fix", " Corrected region ", "2026-04-27T12:00:00+00:00")

    assert result == "existing\n[2026-04-27T12:00:00+00:00 admin_fix] Corrected region"


def test_assignment_search_text_includes_patient_equipment_and_region():
    text = _assignment_search_text(
        {
            "status": "active",
            "region": "Tampa",
            "patients": {"full_name": "Scott Z"},
            "equipment": {
                "serial_number": "SG34U48348MG0",
                "make": "Pride",
                "model": "SUV",
            },
        }
    )

    assert "scott z" in text
    assert "sg34u48348mg0" in text
    assert "tampa" in text
