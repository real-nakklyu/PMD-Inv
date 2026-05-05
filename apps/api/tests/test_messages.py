from app.api.routers.messages import _restore_direct_thread_members


def test_restore_direct_thread_members_clears_deleted_at_for_direct_threads():
    client = FakeMessageClient(thread_type="direct")

    _restore_direct_thread_members(client, "thread-1")

    assert client.memberships["member-1"]["deleted_at"] is None
    assert client.memberships["member-2"]["deleted_at"] is None


def test_restore_direct_thread_members_leaves_group_threads_hidden():
    client = FakeMessageClient(thread_type="group")

    _restore_direct_thread_members(client, "thread-1")

    assert client.memberships["member-1"]["deleted_at"] == "2026-05-05T18:22:59+00:00"
    assert client.memberships["member-2"]["deleted_at"] == "2026-05-05T18:23:29+00:00"


class FakeMessageClient:
    def __init__(self, *, thread_type: str):
        self.thread = {"id": "thread-1", "thread_type": thread_type}
        self.memberships = {
            "member-1": {"id": "member-1", "thread_id": "thread-1", "deleted_at": "2026-05-05T18:22:59+00:00"},
            "member-2": {"id": "member-2", "thread_id": "thread-1", "deleted_at": "2026-05-05T18:23:29+00:00"},
        }

    def table(self, table_name: str):
        return FakeMessageQuery(self, table_name)


class FakeMessageQuery:
    def __init__(self, client: FakeMessageClient, table_name: str):
        self.client = client
        self.table_name = table_name
        self.mode = "select"
        self.filters: dict[str, str] = {}
        self.payload: dict | None = None

    def select(self, _columns: str):
        self.mode = "select"
        return self

    def update(self, payload: dict):
        self.mode = "update"
        self.payload = payload
        return self

    def eq(self, column: str, value: str):
        self.filters[column] = value
        return self

    def single(self):
        return self

    def execute(self):
        if self.table_name == "message_threads":
            return FakeResult(self.client.thread if self.filters.get("id") == self.client.thread["id"] else None)

        if self.table_name == "message_thread_members" and self.mode == "update":
            for membership in self.client.memberships.values():
                if membership["thread_id"] == self.filters.get("thread_id"):
                    membership.update(self.payload or {})
            return FakeResult(list(self.client.memberships.values()))

        return FakeResult([])


class FakeResult:
    def __init__(self, data):
        self.data = data
