from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException

from app.db.supabase import SupabaseRestClient


def record_equipment_movement(
    client: SupabaseRestClient,
    *,
    actor_id: str,
    payload: dict[str, Any],
    activity_message: str | None = None,
    tolerate_missing_table: bool = False,
) -> dict[str, Any] | None:
    equipment_before = client.table("equipment").select("id,region,status,assigned_at").eq("id", payload["equipment_id"]).single().execute().data
    data = {
        **payload,
        "created_by": actor_id,
        "moved_at": payload.get("moved_at") or datetime.now(UTC).isoformat(),
    }
    try:
        movement = client.table("equipment_movements").insert(data).execute().data[0]
    except HTTPException as exc:
        if tolerate_missing_table and _is_missing_movement_table(exc):
            return None
        raise

    equipment_patch = _equipment_patch_from_movement(movement, equipment_before)
    if equipment_patch:
        client.table("equipment").update(equipment_patch).eq("id", movement["equipment_id"]).execute()

    ended_assignment_id = _end_assignment_if_moved_out_of_patient(client, movement, equipment_before)

    try:
        client.table("activity_logs").insert(
            {
                "event_type": "equipment_moved",
                "actor_id": actor_id,
                "equipment_id": movement["equipment_id"],
                "patient_id": movement.get("patient_id"),
                "assignment_id": movement.get("assignment_id"),
                "return_id": movement.get("return_id"),
                "service_ticket_id": movement.get("service_ticket_id"),
                "message": activity_message or _movement_message(movement),
                "metadata": {
                    "movement_id": movement["id"],
                    "movement_type": movement["movement_type"],
                    "ended_assignment_id": ended_assignment_id,
                    "from": {
                        "type": movement["from_location_type"],
                        "label": movement.get("from_location_label"),
                        "region": movement.get("from_region"),
                    },
                    "to": {
                        "type": movement["to_location_type"],
                        "label": movement.get("to_location_label"),
                        "region": movement.get("to_region"),
                    },
                    "equipment_update": equipment_patch,
                },
            }
        ).execute()
    except HTTPException as exc:
        if "invalid input value for enum activity_event_type" not in str(exc.detail).lower():
            raise

    return movement


def maybe_record_delivery_completion_movement(
    client: SupabaseRestClient,
    *,
    actor_id: str,
    before: dict[str, Any],
    after: dict[str, Any],
) -> None:
    if before.get("status") == after.get("status") or after.get("status") != "completed":
        return
    if after.get("kind") != "delivery" or not after.get("equipment_id"):
        return

    record_equipment_movement(
        client,
        actor_id=actor_id,
        tolerate_missing_table=True,
        payload={
            "equipment_id": after["equipment_id"],
            "movement_type": "driver_to_patient",
            "from_location_type": "driver",
            "from_location_label": after.get("driver_name") or "Delivery driver",
            "from_region": after.get("region"),
            "to_location_type": "patient",
            "to_location_label": after.get("location_note") or "Patient delivery location",
            "to_region": after.get("region"),
            "patient_id": after.get("patient_id"),
            "appointment_id": after.get("id"),
            "notes": f"Auto-recorded when delivery appointment was completed: {after.get('title', 'Delivery')}.",
        },
        activity_message=f"Equipment moved to patient from delivery appointment: {after.get('title', 'Delivery')}.",
    )


def _is_missing_movement_table(exc: HTTPException) -> bool:
    detail = str(exc.detail).lower()
    return "equipment_movements" in detail and ("does not exist" in detail or "schema cache" in detail)


def _movement_message(movement: dict[str, Any]) -> str:
    from_label = movement.get("from_location_label") or movement["from_location_type"]
    to_label = movement.get("to_location_label") or movement["to_location_type"]
    return f"Equipment moved from {from_label} to {to_label}."


def _equipment_patch_from_movement(movement: dict[str, Any], equipment_before: dict[str, Any] | None) -> dict[str, Any]:
    patch: dict[str, Any] = {}
    to_region = movement.get("to_region")
    if to_region and to_region != (equipment_before or {}).get("region"):
        patch["region"] = to_region

    next_status = _status_from_movement(movement)
    if next_status and next_status != (equipment_before or {}).get("status"):
        patch["status"] = next_status

    assigned_at = (equipment_before or {}).get("assigned_at")
    if next_status == "assigned" and not assigned_at:
        patch["assigned_at"] = movement["moved_at"]
    elif next_status and next_status != "assigned" and assigned_at:
        patch["assigned_at"] = None

    return patch


def _status_from_movement(movement: dict[str, Any]) -> str | None:
    movement_type = movement.get("movement_type")
    to_location_type = movement.get("to_location_type")

    if movement_type == "region_transfer" and movement.get("from_location_type") != "patient":
        return None
    if movement_type == "retired" or to_location_type == "retired":
        return "retired"
    if to_location_type == "patient":
        return "assigned"
    if to_location_type == "return_in_transit" or movement_type == "patient_to_return":
        return "return_in_progress"
    if to_location_type == "repair" or movement_type == "warehouse_to_repair":
        return "in_repair"
    if to_location_type == "warehouse" and (movement_type in {"received_into_inventory", "return_to_warehouse", "repair_to_warehouse", "manual_adjustment"} or movement.get("from_location_type") == "patient"):
        return "available"
    return None


def _end_assignment_if_moved_out_of_patient(client: SupabaseRestClient, movement: dict[str, Any], equipment_before: dict[str, Any] | None) -> str | None:
    if not _movement_leaves_patient_assignment(movement, equipment_before):
        return None

    active_assignments = (
        client.table("assignments")
        .select("id")
        .eq("equipment_id", movement["equipment_id"])
        .in_("status", ["active", "return_in_progress"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not active_assignments:
        return None

    assignment_id = active_assignments[0]["id"]
    client.table("assignments").update({"status": "ended", "ended_at": movement["moved_at"]}).eq("id", assignment_id).execute()
    return assignment_id


def _movement_leaves_patient_assignment(movement: dict[str, Any], equipment_before: dict[str, Any] | None) -> bool:
    to_location_type = movement.get("to_location_type")
    if to_location_type == "patient":
        return False
    if (equipment_before or {}).get("status") == "assigned":
        return True
    return movement.get("from_location_type") == "patient"
