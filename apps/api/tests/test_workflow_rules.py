import pytest
from fastapi import HTTPException

from app.services.workflows import RETURN_TRANSITIONS, SERVICE_TRANSITIONS


def test_return_cannot_close_from_requested():
    assert "closed" not in RETURN_TRANSITIONS["requested"]


def test_return_can_progress_to_received_from_in_transit():
    assert "received" in RETURN_TRANSITIONS["in_transit"]


def test_service_ticket_can_jump_between_valid_statuses():
    assert "closed" in SERVICE_TRANSITIONS["open"]
    assert "cancelled" in SERVICE_TRANSITIONS["open"]
    assert "in_progress" in SERVICE_TRANSITIONS["closed"]


def test_http_exception_import_available():
    with pytest.raises(HTTPException):
        raise HTTPException(status_code=409, detail="workflow conflict")
