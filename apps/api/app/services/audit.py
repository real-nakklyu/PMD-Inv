from typing import Any

from app.db.supabase import SupabaseRestClient

IGNORED_AUDIT_FIELDS = {"updated_at", "created_at"}


def build_change_set(before: dict[str, Any], after: dict[str, Any], fields: list[str] | None = None) -> dict[str, dict[str, Any]]:
    keys = fields or sorted(set(before.keys()) | set(after.keys()))
    changes: dict[str, dict[str, Any]] = {}
    for key in keys:
        if key in IGNORED_AUDIT_FIELDS:
            continue
        old = before.get(key)
        new = after.get(key)
        if old != new:
            changes[key] = {"before": old, "after": new}
    return changes


def log_change_activity(
    client: SupabaseRestClient,
    *,
    event_type: str,
    actor_id: str,
    message: str,
    before: dict[str, Any],
    after: dict[str, Any],
    fields: list[str] | None = None,
    equipment_id: str | None = None,
    patient_id: str | None = None,
    assignment_id: str | None = None,
    return_id: str | None = None,
    service_ticket_id: str | None = None,
) -> None:
    changes = build_change_set(before, after, fields)
    if not changes:
        return
    client.table("activity_logs").insert(
        {
            "event_type": event_type,
            "actor_id": actor_id,
            "equipment_id": equipment_id,
            "patient_id": patient_id,
            "assignment_id": assignment_id,
            "return_id": return_id,
            "service_ticket_id": service_ticket_id,
            "message": message,
            "metadata": {"changes": changes},
        }
    ).execute()
