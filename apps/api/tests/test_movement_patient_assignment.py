import pytest
from fastapi import HTTPException

from app.services.movements import _create_assignment_from_patient_movement, _validate_patient_destination


def test_patient_destination_must_match_to_region():
    client = FakeMovementClient(
        patients=[{"id": "patient-1", "full_name": "Jamie Patient", "region": "Tampa"}],
    )

    with pytest.raises(HTTPException) as exc:
        _validate_patient_destination(
            client,
            {
                "to_location_type": "patient",
                "patient_id": "patient-1",
                "to_region": "Orlando",
            },
        )

    assert exc.value.status_code == 409
    assert "Jamie Patient is in Tampa" in exc.value.detail


def test_patient_destination_requires_patient_id():
    client = FakeMovementClient()

    with pytest.raises(HTTPException) as exc:
        _validate_patient_destination(client, {"to_location_type": "patient", "to_region": "Tampa"})

    assert exc.value.status_code == 422
    assert "Choose the patient" in exc.value.detail


def test_patient_movement_creates_assignment_and_activity():
    client = FakeMovementClient()
    movement = {
        "id": "move-1",
        "equipment_id": "eq-1",
        "patient_id": "patient-1",
        "moved_at": "2026-04-28T12:00:00+00:00",
        "notes": "Manual warehouse delivery.",
    }
    patient = {"id": "patient-1", "full_name": "Jamie Patient", "region": "Tampa"}

    assignment = _create_assignment_from_patient_movement(
        client,
        movement=movement,
        patient=patient,
        actor_id="staff-1",
    )

    assert assignment["equipment_id"] == "eq-1"
    assert assignment["patient_id"] == "patient-1"
    assert assignment["region"] == "Tampa"
    assert assignment["assigned_at"] == movement["moved_at"]
    assert client.tables["activity_logs"][0]["event_type"] == "patient_assigned"


class FakeMovementClient:
    def __init__(self, *, patients=None, assignments=None):
        self.tables = {
            "patients": patients or [],
            "assignments": assignments or [],
            "activity_logs": [],
        }

    def table(self, table_name):
        return FakeMovementQuery(self, table_name)


class FakeMovementQuery:
    def __init__(self, client, table_name):
        self.client = client
        self.table_name = table_name
        self.filters = []
        self.in_filters = []
        self.payload = None
        self.mode = "select"
        self.expect_single = False

    def select(self, _columns):
        self.mode = "select"
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def in_(self, column, values):
        self.in_filters.append((column, values))
        return self

    def single(self):
        self.expect_single = True
        return self

    def insert(self, payload):
        self.mode = "insert"
        self.payload = payload
        return self

    def execute(self):
        if self.mode == "insert":
            row = {
                "id": f"{self.table_name}-{len(self.client.tables[self.table_name]) + 1}",
                **self.payload,
            }
            self.client.tables[self.table_name].append(row)
            return FakeResult([row])

        rows = list(self.client.tables[self.table_name])
        for column, value in self.filters:
            rows = [row for row in rows if row.get(column) == value]
        for column, values in self.in_filters:
            rows = [row for row in rows if row.get(column) in values]
        if self.expect_single:
            return FakeResult(rows[0] if rows else None)
        return FakeResult(rows)


class FakeResult:
    def __init__(self, data):
        self.data = data
