from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status

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
    _validate_movement_against_equipment(payload, equipment_before)
    destination_patient = _validate_patient_destination(client, payload)
    data = {
        **payload,
        "created_by": actor_id,
        "moved_at": payload.get("moved_at") or datetime.now(UTC).isoformat(),
    }
    if destination_patient and not data.get("to_location_label"):
        data["to_location_label"] = destination_patient["full_name"]
    try:
        movement = client.table("equipment_movements").insert(data).execute().data[0]
    except HTTPException as exc:
        if tolerate_missing_table and _is_missing_movement_table(exc):
            return None
        raise

    assignment = _create_assignment_from_patient_movement(
        client,
        movement=movement,
        patient=destination_patient,
        actor_id=actor_id,
    ) if destination_patient else None
    if assignment:
        movement["assignment_id"] = assignment["id"]
        client.table("equipment_movements").update({"assignment_id": assignment["id"]}).eq("id", movement["id"]).execute()

    equipment_patch = _equipment_patch_from_movement(movement, equipment_before)
    if equipment_patch:
        client.table("equipment").update(equipment_patch).eq("id", movement["equipment_id"]).execute()

    ended_assignment_ids = [] if assignment else _end_assignments_if_moved_out_of_patient(client, movement, equipment_before)

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
                    "ended_assignment_id": ended_assignment_ids[0] if ended_assignment_ids else None,
                    "ended_assignment_ids": ended_assignment_ids,
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


def _validate_movement_against_equipment(movement: dict[str, Any], equipment_before: dict[str, Any] | None) -> None:
    if not equipment_before:
        raise HTTPException(status_code=404, detail="Equipment not found.")

    current_region = equipment_before.get("region")
    from_region = movement.get("from_region")
    to_region = movement.get("to_region")

    if current_region and from_region and from_region != current_region:
        raise HTTPException(
            status_code=409,
            detail=f"This unit is currently in {current_region}. From region must be {current_region}.",
        )

    if movement.get("movement_type") == "region_transfer" and (not to_region or to_region == current_region):
        raise HTTPException(
            status_code=409,
            detail=f"This unit is already in {current_region}. Choose a different destination region.",
        )

    if (
        movement.get("movement_type") == "manual_adjustment"
        and (not to_region or to_region == current_region)
        and movement.get("from_location_type") == movement.get("to_location_type")
    ):
        raise HTTPException(
            status_code=409,
            detail=f"This unit is already in {current_region}. Choose a different destination.",
        )


def _validate_patient_destination(client: SupabaseRestClient, movement: dict[str, Any]) -> dict[str, Any] | None:
    if movement.get("to_location_type") != "patient":
        return None

    patient_id = movement.get("patient_id")
    if not patient_id:
        raise HTTPException(
            status_code=422,
            detail="Choose the patient receiving this equipment.",
        )

    to_region = movement.get("to_region")
    if not to_region:
        raise HTTPException(
            status_code=422,
            detail="Choose the destination region before assigning to a patient.",
        )

    patient = client.table("patients").select("id,full_name,region").eq("id", patient_id).single().execute().data
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    if patient["region"] != to_region:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{patient['full_name']} is in {patient['region']}. Choose a patient in {to_region} or move to {patient['region']}.",
        )

    return patient


def _create_assignment_from_patient_movement(
    client: SupabaseRestClient,
    *,
    movement: dict[str, Any],
    patient: dict[str, Any],
    actor_id: str,
) -> dict[str, Any]:
    active_equipment_assignments = (
        client.table("assignments")
        .select("id,patient_id,equipment_id,status")
        .eq("equipment_id", movement["equipment_id"])
        .in_("status", ["active", "return_in_progress"])
        .execute()
        .data
        or []
    )
    same_patient_assignment = next(
        (assignment for assignment in active_equipment_assignments if assignment["patient_id"] == patient["id"]),
        None,
    )
    if same_patient_assignment:
        return same_patient_assignment
    if active_equipment_assignments:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This equipment already has an active patient assignment. Move it out of the current patient first.",
        )

    active_patient_assignments = (
        client.table("assignments")
        .select("id,equipment_id")
        .eq("patient_id", patient["id"])
        .in_("status", ["active", "return_in_progress"])
        .execute()
        .data
        or []
    )
    other_patient_assignment = next(
        (assignment for assignment in active_patient_assignments if assignment["equipment_id"] != movement["equipment_id"]),
        None,
    )
    if other_patient_assignment:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This patient already has an active equipment assignment.",
        )

    assignment = (
        client.table("assignments")
        .insert(
            {
                "equipment_id": movement["equipment_id"],
                "patient_id": patient["id"],
                "region": patient["region"],
                "status": "active",
                "assigned_at": movement["moved_at"],
                "notes": movement.get("notes"),
                "created_by": actor_id,
            }
        )
        .execute()
        .data[0]
    )
    client.table("activity_logs").insert(
        {
            "event_type": "patient_assigned",
            "actor_id": actor_id,
            "equipment_id": movement["equipment_id"],
            "patient_id": patient["id"],
            "assignment_id": assignment["id"],
            "message": "Equipment assigned to patient from movement ledger.",
        }
    ).execute()
    return assignment


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
    ended_ids = _end_assignments_if_moved_out_of_patient(client, movement, equipment_before)
    return ended_ids[0] if ended_ids else None


def _end_assignments_if_moved_out_of_patient(client: SupabaseRestClient, movement: dict[str, Any], equipment_before: dict[str, Any] | None) -> list[str]:
    if not _movement_leaves_patient_assignment(movement, equipment_before):
        return []

    active_assignments = (
        client.table("assignments")
        .select("id")
        .eq("equipment_id", movement["equipment_id"])
        .in_("status", ["active", "return_in_progress"])
        .execute()
        .data
        or []
    )
    if not active_assignments:
        return []

    ended_ids = [assignment["id"] for assignment in active_assignments]
    for assignment_id in ended_ids:
        client.table("assignments").update({"status": "ended", "ended_at": movement["moved_at"]}).eq("id", assignment_id).execute()
    return ended_ids


def _movement_leaves_patient_assignment(movement: dict[str, Any], equipment_before: dict[str, Any] | None) -> bool:
    to_location_type = movement.get("to_location_type")
    if to_location_type == "patient":
        return False
    if (equipment_before or {}).get("status") == "assigned":
        return True
    return movement.get("from_location_type") == "patient"
