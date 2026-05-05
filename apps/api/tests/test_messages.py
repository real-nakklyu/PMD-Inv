from app.api.routers.messages import _latest_messages_for_thread, _restore_direct_thread_members


def test_latest_messages_for_thread_keeps_newest_message_in_page():
    messages = [
        {"id": f"message-{index}", "thread_id": "thread-1", "created_at": index}
        for index in range(101)
    ]
    client = FakeMessageClient(thread_type="direct", messages=messages)

    result = _latest_messages_for_thread(client, "thread-1")

    assert len(result) == 100
    assert result[0]["id"] == "message-1"
    assert result[-1]["id"] == "message-100"


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
    def __init__(self, *, thread_type: str, messages: list[dict] | None = None):
        self.thread = {"id": "thread-1", "thread_type": thread_type}
        self.messages = messages or []
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
        self.desc = False
        self.row_limit: int | None = None
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

    def order(self, _column: str, *, desc: bool = False):
        self.desc = desc
        return self

    def limit(self, value: int):
        self.row_limit = value
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

        if self.table_name == "messages":
            messages = [
                message
                for message in self.client.messages
                if message["thread_id"] == self.filters.get("thread_id")
            ]
            messages = sorted(messages, key=lambda message: message["created_at"], reverse=self.desc)
            if self.row_limit is not None:
                messages = messages[: self.row_limit]
            return FakeResult(messages)

        return FakeResult([])


class FakeResult:
    def __init__(self, data):
        self.data = data
