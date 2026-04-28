import pytest
from fastapi import HTTPException

from app.api.routers.equipment import _assignment_count_label, _end_active_assignments_for_equipment
from app.services.movements import _end_assignment_if_moved_out_of_patient, _end_assignments_if_moved_out_of_patient, _equipment_patch_from_movement, _validate_movement_against_equipment
from app.services.workflows import RETURN_TRANSITIONS, SERVICE_TRANSITIONS, _ensure_assignment_regions_match


def test_return_can_close_directly_from_requested():
    assert "closed" in RETURN_TRANSITIONS["requested"]
    assert "closed" in RETURN_TRANSITIONS["scheduled"]


def test_return_can_progress_to_received_from_in_transit():
    assert "received" in RETURN_TRANSITIONS["in_transit"]


def test_service_ticket_can_jump_between_valid_statuses():
    assert "closed" in SERVICE_TRANSITIONS["open"]
    assert "cancelled" in SERVICE_TRANSITIONS["open"]
    assert "in_progress" in SERVICE_TRANSITIONS["closed"]


def test_http_exception_import_available():
    with pytest.raises(HTTPException):
        raise HTTPException(status_code=409, detail="workflow conflict")


def test_region_transfer_updates_equipment_region_without_changing_status():
    patch = _equipment_patch_from_movement(
        {
            "movement_type": "region_transfer",
            "to_location_type": "warehouse",
            "to_region": "Tampa",
            "moved_at": "2026-04-27T12:00:00+00:00",
        },
        {"region": "Orlando", "status": "available", "assigned_at": None},
    )
    assert patch == {"region": "Tampa"}


def test_return_to_warehouse_makes_equipment_available_and_clears_assignment_timestamp():
    patch = _equipment_patch_from_movement(
        {
            "movement_type": "return_to_warehouse",
            "to_location_type": "warehouse",
            "to_region": "Tampa",
            "moved_at": "2026-04-27T12:00:00+00:00",
        },
        {"region": "Tampa", "status": "return_in_progress", "assigned_at": "2026-04-01T10:00:00+00:00"},
    )
    assert patch == {"status": "available", "assigned_at": None}


def test_patient_to_warehouse_region_transfer_disassigns_equipment():
    patch = _equipment_patch_from_movement(
        {
            "movement_type": "region_transfer",
            "from_location_type": "patient",
            "to_location_type": "warehouse",
            "to_region": "Tampa",
            "moved_at": "2026-04-27T12:00:00+00:00",
        },
        {"region": "Orlando", "status": "assigned", "assigned_at": "2026-04-01T10:00:00+00:00"},
    )
    assert patch == {"region": "Tampa", "status": "available", "assigned_at": None}


def test_driver_to_patient_marks_equipment_assigned():
    patch = _equipment_patch_from_movement(
        {
            "movement_type": "driver_to_patient",
            "to_location_type": "patient",
            "to_region": "Miami",
            "moved_at": "2026-04-27T12:00:00+00:00",
        },
        {"region": "Tampa", "status": "available", "assigned_at": None},
    )
    assert patch == {
        "region": "Miami",
        "status": "assigned",
        "assigned_at": "2026-04-27T12:00:00+00:00",
    }


def test_movement_from_region_must_match_current_equipment_region():
    with pytest.raises(HTTPException) as exc:
        _validate_movement_against_equipment(
            {
                "movement_type": "region_transfer",
                "from_location_type": "warehouse",
                "from_region": "Orlando",
                "to_location_type": "warehouse",
                "to_region": "Tampa",
            },
            {"region": "Tampa", "status": "available", "assigned_at": None},
        )

    assert exc.value.status_code == 409
    assert "From region must be Tampa" in exc.value.detail


def test_region_transfer_cannot_target_current_region():
    with pytest.raises(HTTPException) as exc:
        _validate_movement_against_equipment(
            {
                "movement_type": "region_transfer",
                "from_location_type": "warehouse",
                "from_region": "Tampa",
                "to_location_type": "warehouse",
                "to_region": "Tampa",
            },
            {"region": "Tampa", "status": "available", "assigned_at": None},
        )

    assert exc.value.status_code == 409
    assert "Choose a different destination region" in exc.value.detail


def test_manual_adjustment_cannot_record_same_region_and_location():
    with pytest.raises(HTTPException) as exc:
        _validate_movement_against_equipment(
            {
                "movement_type": "manual_adjustment",
                "from_location_type": "warehouse",
                "from_region": "Tampa",
                "to_location_type": "warehouse",
                "to_region": "Tampa",
            },
            {"region": "Tampa", "status": "available", "assigned_at": None},
        )

    assert exc.value.status_code == 409
    assert "Choose a different destination" in exc.value.detail


def test_same_region_driver_to_patient_movement_is_still_allowed():
    _validate_movement_against_equipment(
        {
            "movement_type": "driver_to_patient",
            "from_location_type": "driver",
            "from_region": "Tampa",
            "to_location_type": "patient",
            "to_region": "Tampa",
        },
        {"region": "Tampa", "status": "assigned", "assigned_at": "2026-04-01T10:00:00+00:00"},
    )


def test_archive_equipment_ends_active_assignments():
    client = FakeSupabaseClient()
    count = _end_active_assignments_for_equipment(client, "eq-1", ended_at="2026-04-27T12:00:00+00:00")

    assert count == 2
    assert client.assignment_updates == [
        ("a-1", {"status": "ended", "ended_at": "2026-04-27T12:00:00+00:00"}),
        ("a-2", {"status": "ended", "ended_at": "2026-04-27T12:00:00+00:00"}),
    ]
    assert client.assignment_filters[0] == [("equipment_id", "eq-1"), ("status", ["active", "return_in_progress"])]
    assert _assignment_count_label(1) == "1 active assignment"
    assert _assignment_count_label(2) == "2 active assignments"


def test_assignment_requires_equipment_and_patient_same_region():
    _ensure_assignment_regions_match({"region": "Tampa"}, {"region": "Tampa"})
    with pytest.raises(HTTPException) as exc:
        _ensure_assignment_regions_match({"region": "Orlando"}, {"region": "Tampa"})
    assert exc.value.status_code == 409
    assert "Record a movement to Tampa" in exc.value.detail


def test_moving_equipment_out_of_patient_ends_active_assignment():
    client = FakeSupabaseClient()
    assignment_id = _end_assignment_if_moved_out_of_patient(
        client,
        {
            "equipment_id": "eq-1",
            "from_location_type": "patient",
            "to_location_type": "warehouse",
            "moved_at": "2026-04-27T12:00:00+00:00",
        },
        {"status": "assigned"},
    )

    assert assignment_id == "a-1"
    assert client.assignment_updates == [
        ("a-1", {"status": "ended", "ended_at": "2026-04-27T12:00:00+00:00"}),
        ("a-2", {"status": "ended", "ended_at": "2026-04-27T12:00:00+00:00"}),
    ]


def test_moving_equipment_out_of_patient_ends_all_duplicate_active_assignments():
    client = FakeSupabaseClient()
    assignment_ids = _end_assignments_if_moved_out_of_patient(
        client,
        {
            "equipment_id": "eq-1",
            "from_location_type": "patient",
            "to_location_type": "warehouse",
            "moved_at": "2026-04-27T12:00:00+00:00",
        },
        {"status": "assigned"},
    )

    assert assignment_ids == ["a-1", "a-2"]
    assert client.assignment_updates == [
        ("a-1", {"status": "ended", "ended_at": "2026-04-27T12:00:00+00:00"}),
        ("a-2", {"status": "ended", "ended_at": "2026-04-27T12:00:00+00:00"}),
    ]


class FakeSupabaseClient:
    def __init__(self):
        self.assignment_updates = []
        self.assignment_filters = []

    def table(self, table_name):
        assert table_name == "assignments"
        return FakeAssignmentsQuery(self)


class FakeAssignmentsQuery:
    def __init__(self, client):
        self.client = client
        self.filters = []
        self.payload = None
        self.mode = "select"

    def select(self, _columns):
        self.mode = "select"
        return self

    def update(self, payload):
        self.mode = "update"
        self.payload = payload
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def in_(self, column, values):
        self.filters.append((column, values))
        return self

    def limit(self, _value):
        return self

    def execute(self):
        if self.mode == "select":
            self.client.assignment_filters.append(self.filters)
            return FakeResult([{"id": "a-1"}, {"id": "a-2"}])
        assignment_id = dict(self.filters)["id"]
        self.client.assignment_updates.append((assignment_id, self.payload))
        return FakeResult([{"id": assignment_id, **self.payload}])


class FakeResult:
    def __init__(self, data):
        self.data = data
