from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthUser, require_roles
from app.db.supabase import SupabaseRestClient, get_supabase
from app.schemas.corrections import (
    AssignmentCorrectionRequest,
    CorrectionOverview,
    EquipmentRegionCorrectionRequest,
    EquipmentRestoreRequest,
    EquipmentRetireRequest,
    MovementReconcileRequest,
    PatientMergeRequest,
)
from app.services.audit import build_change_set
from app.services.movements import (
    _end_assignment_if_moved_out_of_patient,
    _equipment_patch_from_movement,
    record_equipment_movement,
)

router = APIRouter(prefix="/corrections", tags=["corrections"])


@router.get("/overview", response_model=CorrectionOverview)
def correction_overview(_: Annotated[AuthUser, Depends(require_roles("admin"))]):
    client = get_supabase()
    active_assignments = _active_assignment_rows(client, limit=300)
    assigned_equipment = _equipment_by_status(client, ["assigned", "return_in_progress"], limit=300)
    latest_movements = _latest_movements_by_equipment(client, limit=300)

    active_equipment_ids = {item["equipment_id"] for item in active_assignments}
    issues: list[dict[str, Any]] = []

    for assignment in active_assignments:
        equipment = assignment.get("equipment") or {}
        patient = assignment.get("patients") or {}
        if equipment and equipment.get("status") not in {"assigned", "return_in_progress"}:
            issues.append(
                _issue(
                    "critical",
                    "Active assignment with wrong equipment status",
                    f"{_equipment_label(equipment)} is assigned to {_patient_label(patient)} but equipment status is {equipment.get('status')}.",
                    "End the assignment or correct the equipment status.",
                    f"/equipment/{assignment['equipment_id']}",
                )
            )
        if equipment and patient and equipment.get("region") != patient.get("region"):
            issues.append(
                _issue(
                    "warning",
                    "Patient and equipment regions differ",
                    f"{_equipment_label(equipment)} is in {equipment.get('region')} while {_patient_label(patient)} is in {patient.get('region')}.",
                    "Move the equipment or correct the patient/equipment region.",
                    f"/equipment/{assignment['equipment_id']}",
                )
            )
        if assignment.get("region") and equipment and assignment.get("region") != equipment.get("region"):
            issues.append(
                _issue(
                    "warning",
                    "Assignment region differs from equipment",
                    f"Assignment region is {assignment.get('region')} but equipment is listed in {equipment.get('region')}.",
                    "Use Fix Region with assignment sync enabled.",
                    f"/equipment/{assignment['equipment_id']}",
                )
            )

    for item in assigned_equipment:
        if item["id"] not in active_equipment_ids:
            issues.append(
                _issue(
                    "critical",
                    "Equipment marked assigned without active assignment",
                    f"{_equipment_label(item)} has status {item['status']} but no active assignment was found.",
                    "Restore it to available/in repair or create the missing assignment intentionally.",
                    f"/equipment/{item['id']}",
                )
            )

    movement_mismatch_count = 0
    if latest_movements:
        equipment_lookup = _equipment_lookup(client, list(latest_movements.keys()))
        for equipment_id, movement in latest_movements.items():
            equipment = equipment_lookup.get(equipment_id)
            if not equipment:
                continue
            to_region = movement.get("to_region")
            if to_region and to_region != equipment.get("region"):
                movement_mismatch_count += 1
                issues.append(
                    _issue(
                        "warning",
                        "Latest movement and inventory region differ",
                        f"{_equipment_label(equipment)} latest movement points to {to_region}, but inventory shows {equipment.get('region')}.",
                        "Reconcile the equipment from latest movement.",
                        f"/equipment/{equipment_id}",
                    )
                )

    counts = {
        "active_assignments": len(active_assignments),
        "assigned_equipment": len(assigned_equipment),
        "assignment_issues": len([item for item in issues if "assignment" in item["title"].lower()]),
        "movement_mismatches": movement_mismatch_count,
        "retired_equipment": _count_equipment_status(client, "retired"),
        "archived_equipment": _count_archived_equipment(client),
        "total_issues": len(issues),
    }

    recent = (
        client.table("activity_logs")
        .select("*")
        .order("created_at", desc=True)
        .limit(8)
        .execute()
        .data
        or []
    )
    recent_corrections = [
        item for item in recent if isinstance(item.get("metadata"), dict) and item["metadata"].get("correction")
    ]

    return {"counts": counts, "issues": issues[:40], "recent_corrections": recent_corrections}


@router.get("/active-assignments")
def search_active_assignments(
    _: Annotated[AuthUser, Depends(require_roles("admin"))],
    search: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> list[dict[str, Any]]:
    rows = _active_assignment_rows(get_supabase(), limit=250)
    if search:
        needle = search.strip().lower()
        rows = [
            row
            for row in rows
            if needle in _assignment_search_text(row)
        ]
    return rows[:limit]


@router.get("/equipment")
def search_correction_equipment(
    _: Annotated[AuthUser, Depends(require_roles("admin"))],
    search: str | None = None,
    include_archived: bool = True,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> list[dict[str, Any]]:
    query = get_supabase().table("equipment").select("*")
    if not include_archived:
        query = query.is_("archived_at", "null")
    if search:
        pattern = f"%{search.strip()}%"
        query = query.or_(f"serial_number.ilike.{pattern},make.ilike.{pattern},model.ilike.{pattern}")
    return query.order("created_at", desc=True).limit(limit).execute().data or []


@router.post("/end-assignment")
def end_assignment_correction(
    payload: AssignmentCorrectionRequest,
    user: Annotated[AuthUser, Depends(require_roles("admin"))],
) -> dict[str, Any]:
    client = get_supabase()
    now = _now()
    assignment = _get_assignment(client, str(payload.assignment_id))
    if assignment["status"] == "ended":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This assignment is already ended.")

    equipment_before = _get_equipment(client, assignment["equipment_id"])
    assignment_after = _update_assignment(
        client,
        assignment["id"],
        {
            "status": "ended",
            "ended_at": now,
            "notes": _append_note(assignment.get("notes"), "admin_end_assignment", payload.note, now),
        },
    )
    equipment_after = _update_equipment(
        client,
        assignment["equipment_id"],
        {"status": payload.equipment_status, "assigned_at": None},
    )
    _log_activity(
        client,
        event_type="assignment_ended",
        actor_id=user.id,
        message=f"Admin ended assignment and set equipment to {payload.equipment_status}.",
        correction_type="end_assignment",
        note=payload.note,
        equipment_id=assignment["equipment_id"],
        patient_id=assignment["patient_id"],
        assignment_id=assignment["id"],
        before={"assignment": assignment, "equipment": equipment_before},
        after={"assignment": assignment_after, "equipment": equipment_after},
    )
    return {"message": "Assignment ended and equipment corrected.", "assignment": assignment_after, "equipment": equipment_after}


@router.post("/fix-region")
def fix_equipment_region(
    payload: EquipmentRegionCorrectionRequest,
    user: Annotated[AuthUser, Depends(require_roles("admin"))],
) -> dict[str, Any]:
    client = get_supabase()
    equipment_before = _get_equipment(client, str(payload.equipment_id))
    active_assignment = _active_assignment_for_equipment(client, str(payload.equipment_id))
    patient_before = None

    movement = record_equipment_movement(
        client,
        actor_id=user.id,
        tolerate_missing_table=True,
        payload={
            "equipment_id": str(payload.equipment_id),
            "movement_type": "region_transfer",
            "from_location_type": "unknown",
            "from_location_label": equipment_before.get("region"),
            "from_region": equipment_before.get("region"),
            "to_location_type": "unknown",
            "to_location_label": payload.region,
            "to_region": payload.region,
            "assignment_id": active_assignment.get("id") if active_assignment else None,
            "patient_id": active_assignment.get("patient_id") if active_assignment else None,
            "notes": f"Admin region correction: {payload.note}",
        },
        activity_message=f"Admin corrected equipment region from {equipment_before.get('region')} to {payload.region}.",
    )
    if movement is None:
        _update_equipment(client, str(payload.equipment_id), {"region": payload.region})

    assignment_after = None
    patient_after = None
    if active_assignment and payload.sync_active_assignment:
        assignment_after = _update_assignment(client, active_assignment["id"], {"region": payload.region})
    if active_assignment and payload.sync_active_patient:
        patient_before = _get_patient(client, active_assignment["patient_id"])
        patient_after = _update_patient(client, active_assignment["patient_id"], {"region": payload.region})

    equipment_after = _get_equipment(client, str(payload.equipment_id))
    _log_activity(
        client,
        event_type="equipment_edited",
        actor_id=user.id,
        message=f"Admin corrected region for {equipment_after['serial_number']} to {payload.region}.",
        correction_type="fix_region",
        note=payload.note,
        equipment_id=str(payload.equipment_id),
        patient_id=active_assignment.get("patient_id") if active_assignment else None,
        assignment_id=active_assignment.get("id") if active_assignment else None,
        before={
            "equipment": equipment_before,
            "assignment": active_assignment,
            "patient": patient_before,
        },
        after={
            "equipment": equipment_after,
            "assignment": assignment_after,
            "patient": patient_after,
        },
    )
    return {"message": "Region correction saved.", "equipment": equipment_after, "assignment": assignment_after, "patient": patient_after}


@router.post("/retire-equipment")
def retire_equipment(
    payload: EquipmentRetireRequest,
    user: Annotated[AuthUser, Depends(require_roles("admin"))],
) -> dict[str, Any]:
    client = get_supabase()
    equipment_before = _get_equipment(client, str(payload.equipment_id))
    movement = record_equipment_movement(
        client,
        actor_id=user.id,
        tolerate_missing_table=True,
        payload={
            "equipment_id": str(payload.equipment_id),
            "movement_type": "retired",
            "from_location_type": "unknown",
            "from_location_label": equipment_before.get("status"),
            "from_region": equipment_before.get("region"),
            "to_location_type": "retired",
            "to_location_label": "Retired",
            "to_region": equipment_before.get("region"),
            "notes": f"Admin retired equipment: {payload.note}",
        },
        activity_message=f"Admin retired equipment {equipment_before['serial_number']}.",
    )
    if movement is None:
        _update_equipment(client, str(payload.equipment_id), {"status": "retired", "assigned_at": None})
    ended_assignments = _end_active_assignments(client, str(payload.equipment_id), payload.note) if payload.end_active_assignments else []
    equipment_after = _get_equipment(client, str(payload.equipment_id))
    _log_activity(
        client,
        event_type="equipment_edited",
        actor_id=user.id,
        message=f"Admin retired {equipment_after['serial_number']}.",
        correction_type="retire_equipment",
        note=payload.note,
        equipment_id=str(payload.equipment_id),
        before=equipment_before,
        after={**equipment_after, "ended_assignments": ended_assignments},
    )
    return {"message": "Equipment retired.", "equipment": equipment_after, "ended_assignments": ended_assignments}


@router.post("/restore-equipment")
def restore_equipment(
    payload: EquipmentRestoreRequest,
    user: Annotated[AuthUser, Depends(require_roles("admin"))],
) -> dict[str, Any]:
    client = get_supabase()
    before = _get_equipment(client, str(payload.equipment_id))
    patch: dict[str, Any] = {"status": payload.status, "assigned_at": None, "archived_at": None}
    if payload.region:
        patch["region"] = payload.region
    after = _update_equipment(client, str(payload.equipment_id), patch)
    _log_activity(
        client,
        event_type="equipment_edited",
        actor_id=user.id,
        message=f"Admin restored {after['serial_number']} to {payload.status}.",
        correction_type="restore_equipment",
        note=payload.note,
        equipment_id=str(payload.equipment_id),
        before=before,
        after=after,
    )
    return {"message": "Equipment restored.", "equipment": after}


@router.post("/reconcile-movement")
def reconcile_movement_history(
    payload: MovementReconcileRequest,
    user: Annotated[AuthUser, Depends(require_roles("admin"))],
) -> dict[str, Any]:
    client = get_supabase()
    before = _get_equipment(client, str(payload.equipment_id))
    movement = _latest_movement(client, str(payload.equipment_id))
    if not movement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No movement history exists for this equipment.")

    patch = _equipment_patch_from_movement(movement, before)
    ended_assignment_id = _end_assignment_if_moved_out_of_patient(client, movement, before)
    after = _update_equipment(client, str(payload.equipment_id), patch) if patch else before
    _log_activity(
        client,
        event_type="equipment_edited",
        actor_id=user.id,
        message=f"Admin reconciled {after['serial_number']} from latest movement.",
        correction_type="reconcile_movement",
        note=payload.note,
        equipment_id=str(payload.equipment_id),
        patient_id=movement.get("patient_id"),
        assignment_id=movement.get("assignment_id") or ended_assignment_id,
        before=before,
        after={**after, "latest_movement_id": movement["id"], "ended_assignment_id": ended_assignment_id},
    )
    return {"message": "Movement history reconciled.", "equipment": after, "latest_movement": movement, "ended_assignment_id": ended_assignment_id}


@router.post("/merge-patients")
def merge_patients(
    payload: PatientMergeRequest,
    user: Annotated[AuthUser, Depends(require_roles("admin"))],
) -> dict[str, Any]:
    client = get_supabase()
    now = _now()
    source = _get_patient(client, str(payload.source_patient_id))
    target = _get_patient(client, str(payload.target_patient_id))
    updated_counts = _move_patient_references(
        client,
        source_patient_id=str(payload.source_patient_id),
        target_patient_id=str(payload.target_patient_id),
        target_region=target["region"],
    )
    archived_source = _update_patient(
        client,
        str(payload.source_patient_id),
        {
            "archived_at": now,
        },
    )
    _log_activity(
        client,
        event_type="patient_created",
        actor_id=user.id,
        message=f"Admin merged duplicate patient {source['full_name']} into {target['full_name']}.",
        correction_type="merge_patients",
        note=payload.note,
        patient_id=str(payload.target_patient_id),
        before={"source": source, "target": target},
        after={"source": archived_source, "target": target, "updated_counts": updated_counts},
    )
    return {"message": "Patients merged. Source patient was archived.", "source_patient": archived_source, "target_patient": target, "updated_counts": updated_counts}


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _active_assignment_rows(client: SupabaseRestClient, *, limit: int) -> list[dict[str, Any]]:
    return (
        client.table("assignments")
        .select("*, patients(id,full_name,date_of_birth,region), equipment(id,serial_number,make,model,equipment_type,status,region)")
        .in_("status", ["active", "return_in_progress"])
        .order("assigned_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )


def _equipment_by_status(client: SupabaseRestClient, statuses: list[str], *, limit: int) -> list[dict[str, Any]]:
    return (
        client.table("equipment")
        .select("id,serial_number,make,model,equipment_type,status,region,assigned_at")
        .in_("status", statuses)
        .is_("archived_at", "null")
        .order("updated_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )


def _count_equipment_status(client: SupabaseRestClient, status_value: str) -> int:
    return (
        client.table("equipment")
        .select("id", count="exact", head=True)
        .eq("status", status_value)
        .is_("archived_at", "null")
        .execute()
        .count
        or 0
    )


def _count_archived_equipment(client: SupabaseRestClient) -> int:
    return client.table("equipment").select("id", count="exact", head=True).is_("archived_at", "not.null").execute().count or 0


def _latest_movements_by_equipment(client: SupabaseRestClient, *, limit: int) -> dict[str, dict[str, Any]]:
    try:
        movements = (
            client.table("equipment_movements")
            .select("*")
            .order("moved_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
    except HTTPException as exc:
        if "equipment_movements" not in str(exc.detail).lower():
            raise
        return {}
    latest: dict[str, dict[str, Any]] = {}
    for movement in movements:
        latest.setdefault(movement["equipment_id"], movement)
    return latest


def _equipment_lookup(client: SupabaseRestClient, equipment_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not equipment_ids:
        return {}
    rows = client.table("equipment").select("id,serial_number,make,model,equipment_type,status,region").in_("id", equipment_ids).execute().data or []
    return {row["id"]: row for row in rows}


def _latest_movement(client: SupabaseRestClient, equipment_id: str) -> dict[str, Any] | None:
    try:
        rows = (
            client.table("equipment_movements")
            .select("*")
            .eq("equipment_id", equipment_id)
            .order("moved_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
    except HTTPException as exc:
        if "equipment_movements" not in str(exc.detail).lower():
            raise
        rows = []
    return rows[0] if rows else None


def _get_assignment(client: SupabaseRestClient, assignment_id: str) -> dict[str, Any]:
    row = client.table("assignments").select("*").eq("id", assignment_id).single().execute().data
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found.")
    return row


def _get_equipment(client: SupabaseRestClient, equipment_id: str) -> dict[str, Any]:
    row = client.table("equipment").select("*").eq("id", equipment_id).single().execute().data
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found.")
    return row


def _get_patient(client: SupabaseRestClient, patient_id: str) -> dict[str, Any]:
    row = client.table("patients").select("*").eq("id", patient_id).single().execute().data
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")
    return row


def _active_assignment_for_equipment(client: SupabaseRestClient, equipment_id: str) -> dict[str, Any] | None:
    rows = (
        client.table("assignments")
        .select("*")
        .eq("equipment_id", equipment_id)
        .in_("status", ["active", "return_in_progress"])
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _update_assignment(client: SupabaseRestClient, assignment_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    return client.table("assignments").update(patch).eq("id", assignment_id).execute().data[0]


def _update_equipment(client: SupabaseRestClient, equipment_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    return client.table("equipment").update(patch).eq("id", equipment_id).execute().data[0]


def _update_patient(client: SupabaseRestClient, patient_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    return client.table("patients").update(patch).eq("id", patient_id).execute().data[0]


def _end_active_assignments(client: SupabaseRestClient, equipment_id: str, note: str) -> list[dict[str, Any]]:
    now = _now()
    rows = (
        client.table("assignments")
        .select("*")
        .eq("equipment_id", equipment_id)
        .in_("status", ["active", "return_in_progress"])
        .execute()
        .data
        or []
    )
    ended = []
    for row in rows:
        ended.append(
            _update_assignment(
                client,
                row["id"],
                {
                    "status": "ended",
                    "ended_at": now,
                    "notes": _append_note(row.get("notes"), "admin_retire_equipment", note, now),
                },
            )
        )
    return ended


def _move_patient_references(
    client: SupabaseRestClient,
    *,
    source_patient_id: str,
    target_patient_id: str,
    target_region: str,
) -> dict[str, int]:
    counts: dict[str, int] = {}
    counts["assignments"] = _safe_update_patient_table(client, "assignments", source_patient_id, target_patient_id)
    _safe_update_active_assignment_regions(client, target_patient_id, target_region)
    counts["returns"] = _safe_update_patient_table(client, "returns", source_patient_id, target_patient_id)
    counts["service_tickets"] = _safe_update_patient_table(client, "service_tickets", source_patient_id, target_patient_id)
    counts["activity_logs"] = _safe_update_patient_table(client, "activity_logs", source_patient_id, target_patient_id)
    counts["equipment_movements"] = _safe_update_patient_table(client, "equipment_movements", source_patient_id, target_patient_id)
    counts["operational_appointments"] = _safe_update_patient_table(client, "operational_appointments", source_patient_id, target_patient_id)
    counts["delivery_setup_checklists"] = _safe_update_patient_table(client, "delivery_setup_checklists", source_patient_id, target_patient_id)
    counts["handoff_notes"] = _safe_update_patient_table(client, "handoff_notes", source_patient_id, target_patient_id)
    return counts


def _safe_update_patient_table(client: SupabaseRestClient, table_name: str, source_patient_id: str, target_patient_id: str) -> int:
    try:
        rows = client.table(table_name).select("id").eq("patient_id", source_patient_id).execute().data or []
        if not rows:
            return 0
        client.table(table_name).update({"patient_id": target_patient_id}).eq("patient_id", source_patient_id).execute()
        return len(rows)
    except HTTPException as exc:
        detail = str(exc.detail).lower()
        if "does not exist" in detail or "schema cache" in detail:
            return 0
        raise


def _safe_update_active_assignment_regions(client: SupabaseRestClient, target_patient_id: str, target_region: str) -> None:
    try:
        client.table("assignments").update({"region": target_region}).eq("patient_id", target_patient_id).in_("status", ["active", "return_in_progress"]).execute()
    except HTTPException:
        return


def _append_note(existing: str | None, label: str, note: str, timestamp: str) -> str:
    prefix = f"[{timestamp} {label}] {note.strip()}"
    return f"{existing}\n{prefix}" if existing else prefix


def _log_activity(
    client: SupabaseRestClient,
    *,
    event_type: str,
    actor_id: str,
    message: str,
    correction_type: str,
    note: str,
    before: dict[str, Any],
    after: dict[str, Any],
    equipment_id: str | None = None,
    patient_id: str | None = None,
    assignment_id: str | None = None,
    return_id: str | None = None,
    service_ticket_id: str | None = None,
) -> None:
    metadata = {
        "correction": {
            "type": correction_type,
            "note": note,
            "changes": build_change_set(before, after),
        }
    }
    try:
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
                "metadata": metadata,
            }
        ).execute()
    except HTTPException as exc:
        if "invalid input value for enum activity_event_type" not in str(exc.detail).lower():
            raise
        client.table("activity_logs").insert(
            {
                "event_type": "equipment_edited",
                "actor_id": actor_id,
                "equipment_id": equipment_id,
                "patient_id": patient_id,
                "assignment_id": assignment_id,
                "return_id": return_id,
                "service_ticket_id": service_ticket_id,
                "message": message,
                "metadata": metadata,
            }
        ).execute()


def _assignment_search_text(row: dict[str, Any]) -> str:
    equipment = row.get("equipment") or {}
    patient = row.get("patients") or {}
    return " ".join(
        [
            str(row.get("status") or ""),
            str(row.get("region") or ""),
            _equipment_label(equipment),
            _patient_label(patient),
        ]
    ).lower()


def _equipment_label(equipment: dict[str, Any]) -> str:
    return f"{equipment.get('serial_number', 'Equipment')} - {equipment.get('make', '')} {equipment.get('model', '')}".strip()


def _patient_label(patient: dict[str, Any]) -> str:
    return patient.get("full_name") or "patient"


def _issue(severity: str, title: str, detail: str, action: str, href: str | None = None) -> dict[str, Any]:
    return {
        "id": f"{severity}:{title}:{detail}"[:180],
        "severity": severity,
        "title": title,
        "detail": detail,
        "action": action,
        "href": href,
    }
