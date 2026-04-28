from fastapi import HTTPException

from app.api.routers import patients as patients_router
from app.core.auth import AuthUser


def test_delete_patient_archives_when_workflow_history_exists(monkeypatch):
    client = FakePatientDeleteClient({"assignments": 1})
    monkeypatch.setattr(patients_router, "get_supabase", lambda: client)

    result = patients_router.delete_patient("patient-1", FakeUser)

    assert result["action"] == "archived"
    assert client.patients["patient-1"]["archived_at"]
    assert client.deleted_patients == []
    assert client.activity_logs[0]["event_type"] == "patient_edited"


def test_delete_patient_hard_deletes_without_references(monkeypatch):
    client = FakePatientDeleteClient({})
    monkeypatch.setattr(patients_router, "get_supabase", lambda: client)

    result = patients_router.delete_patient("patient-1", FakeUser)

    assert result["action"] == "deleted"
    assert client.deleted_patients == ["patient-1"]
    assert client.activity_logs == []


def test_delete_patient_archives_if_database_reports_foreign_key(monkeypatch):
    client = FakePatientDeleteClient({}, delete_raises_fk=True)
    monkeypatch.setattr(patients_router, "get_supabase", lambda: client)

    result = patients_router.delete_patient("patient-1", FakeUser)

    assert result["action"] == "archived"
    assert client.patients["patient-1"]["archived_at"]
    assert client.deleted_patients == []


FakeUser = AuthUser(
    id="staff-1",
    email="admin@example.test",
    role="authenticated",
    app_role="admin",
    full_name="Admin User",
)


class FakePatientDeleteClient:
    def __init__(self, dependency_counts: dict[str, int], *, delete_raises_fk: bool = False):
        self.dependency_counts = dependency_counts
        self.delete_raises_fk = delete_raises_fk
        self.deleted_patients: list[str] = []
        self.activity_logs: list[dict] = []
        self.patients = {
            "patient-1": {
                "id": "patient-1",
                "full_name": "Jane Patient",
                "archived_at": None,
            }
        }

    def table(self, table_name: str):
        return FakePatientDeleteQuery(self, table_name)


class FakePatientDeleteQuery:
    def __init__(self, client: FakePatientDeleteClient, table_name: str):
        self.client = client
        self.table_name = table_name
        self.mode = "select"
        self.filters: dict[str, str] = {}
        self.payload: dict | None = None
        self.expect_single = False

    def select(self, _columns: str, *, count: str | None = None, head: bool = False):
        self.mode = "count" if count == "exact" and head else "select"
        return self

    def insert(self, payload: dict):
        self.mode = "insert"
        self.payload = payload
        return self

    def update(self, payload: dict):
        self.mode = "update"
        self.payload = payload
        return self

    def delete(self):
        self.mode = "delete"
        return self

    def eq(self, column: str, value: str):
        self.filters[column] = value
        return self

    def single(self):
        self.expect_single = True
        return self

    def execute(self):
        if self.mode == "count":
            return FakeResult([], count=self.client.dependency_counts.get(self.table_name, 0))

        if self.table_name == "activity_logs" and self.mode == "insert":
            self.client.activity_logs.append(self.payload or {})
            return FakeResult([self.payload])

        if self.table_name != "patients":
            return FakeResult([])

        patient_id = self.filters.get("id")
        if self.mode == "select":
            return FakeResult(self.client.patients.get(patient_id))

        if self.mode == "update":
            patient = {**self.client.patients[patient_id], **(self.payload or {})}
            self.client.patients[patient_id] = patient
            return FakeResult([patient])

        if self.mode == "delete":
            if self.client.delete_raises_fk:
                raise HTTPException(
                    status_code=400,
                    detail='update or delete on table "patients" violates foreign key constraint',
                )
            self.client.deleted_patients.append(patient_id or "")
            return FakeResult([])

        return FakeResult([])


class FakeResult:
    def __init__(self, data, count: int | None = None):
        self.data = data
        self.count = count
