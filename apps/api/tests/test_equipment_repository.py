import pytest
from fastapi import HTTPException

from app.repositories.equipment import EquipmentRepository
from app.schemas.equipment import EquipmentCreate


def test_duplicate_serial_error_includes_existing_equipment_link():
    client = FakeEquipmentClient(
        [
            {
                "id": "eq-1",
                "serial_number": "SN-100",
                "make": "Pride",
                "model": "Jazzy",
                "equipment_type": "power_wheelchair",
                "status": "available",
                "region": "Tampa",
            }
        ]
    )
    repo = EquipmentRepository(client)

    with pytest.raises(HTTPException) as exc:
        repo.ensure_serial_available("sn-100")

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "duplicate_equipment_serial"
    assert exc.value.detail["equipment_path"] == "/equipment/eq-1"
    assert exc.value.detail["label"] == "SN-100 - Pride Jazzy"


def test_equipment_create_trims_serial_before_min_length_validation():
    payload = EquipmentCreate(
        equipment_type="scooter",
        make="Pride",
        model="Go-Go",
        serial_number="  SN-200  ",
        bought_price=100,
        region="Tampa",
    )

    assert payload.serial_number == "SN-200"


class FakeEquipmentClient:
    def __init__(self, rows):
        self.rows = rows

    def table(self, table_name):
        assert table_name == "equipment"
        return FakeEquipmentQuery(self.rows)


class FakeEquipmentQuery:
    def __init__(self, rows):
        self.rows = rows
        self.serial_number = None
        self.exclude_id = None

    def select(self, _columns):
        return self

    def ilike(self, column, value):
        assert column == "serial_number"
        self.serial_number = value.lower()
        return self

    def is_(self, column, value):
        assert column == "archived_at"
        assert value == "null"
        return self

    def neq(self, column, value):
        assert column == "id"
        self.exclude_id = value
        return self

    def limit(self, _value):
        return self

    def execute(self):
        matches = [
            row
            for row in self.rows
            if row["serial_number"].lower() == self.serial_number and row["id"] != self.exclude_id
        ]
        return FakeResult(matches)


class FakeResult:
    def __init__(self, data):
        self.data = data
