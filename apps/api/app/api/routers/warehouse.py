from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthUser, get_current_user, require_roles
from app.db.supabase import SupabaseRestClient, get_supabase
from app.repositories.simple import (
    WarehouseCycleCountItemRepository,
    WarehouseCycleCountSessionRepository,
    WarehouseInventoryRepository,
    WarehouseRedeployChecklistRepository,
)
from app.schemas.common import FloridaRegion
from app.schemas.operations import (
    WarehouseBulkReceive,
    WarehouseCycleCountCreate,
    WarehouseProfileOut,
    WarehouseProfileUpsert,
    WarehouseReadinessSummary,
    WarehouseRedeployChecklistUpsert,
)
from app.services.movements import record_equipment_movement

router = APIRouter(prefix="/warehouse", tags=["warehouse"])


@router.get("/inventory", response_model=list[WarehouseProfileOut])
def list_warehouse_inventory(
    _: Annotated[AuthUser, Depends(get_current_user)],
    region: Annotated[FloridaRegion | None, Query()] = None,
    readiness_status: str | None = None,
    search: str | None = None,
    limit: Annotated[int, Query(ge=1, le=300)] = 100,
):
    client = get_supabase()
    if not _warehouse_tables_available(client):
        return _warehouse_fallback_inventory(client, region=region, search=search, limit=limit)

    query = client.table("warehouse_inventory_profiles").select(
        "*, equipment(serial_number,make,model,equipment_type,status,region,updated_at,added_at)"
    )
    if region:
        query = query.eq("region", region)
    if readiness_status:
        query = query.eq("readiness_status", readiness_status)
    rows = query.order("updated_at", desc=True).limit(limit).execute().data or []
    if search:
        needle = search.strip().lower()
        rows = [
            row
            for row in rows
            if needle in _warehouse_profile_search_text(row)
        ]
    return rows


@router.get("/summary", response_model=WarehouseReadinessSummary)
def warehouse_summary(_: Annotated[AuthUser, Depends(get_current_user)]):
    client = get_supabase()
    if not _warehouse_tables_available(client):
        available_count = (
            client.table("equipment")
            .select("id", count="exact", head=True)
            .eq("status", "available")
            .is_("archived_at", "null")
            .execute()
            .count
            or 0
        )
        return {
            "ready": available_count,
            "needs_attention": 0,
            "hold": 0,
            "counted_last_30_days": 0,
            "migration_required": True,
        }
    rows = client.table("warehouse_inventory_profiles").select("readiness_status,last_cycle_counted_at").execute().data or []
    cutoff = datetime.now(UTC) - timedelta(days=30)
    return {
        "ready": len([row for row in rows if row["readiness_status"] == "ready"]),
        "needs_attention": len([row for row in rows if row["readiness_status"] in {"needs_cleaning", "needs_battery", "needs_repair"}]),
        "hold": len([row for row in rows if row["readiness_status"] in {"hold", "retired"}]),
        "counted_last_30_days": len([row for row in rows if row.get("last_cycle_counted_at") and _parse_date(row["last_cycle_counted_at"]) >= cutoff]),
        "migration_required": False,
    }


@router.put("/profiles", response_model=WarehouseProfileOut)
def upsert_warehouse_profile(
    payload: WarehouseProfileUpsert,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher", "technician"))],
):
    client = get_supabase()
    _require_warehouse_tables(client)
    equipment = _get_equipment_by_id(client, str(payload.equipment_id))
    data = {**payload.model_dump(mode="json"), "updated_by": user.id}
    record = _upsert_profile(client, data)
    if equipment["region"] != payload.region:
        client.table("equipment").update({"region": payload.region}).eq("id", str(payload.equipment_id)).execute()
    _log_warehouse_activity(
        client,
        actor_id=user.id,
        equipment_id=str(payload.equipment_id),
        event_type="equipment_edited",
        message=f"Warehouse profile updated for {equipment['serial_number']}.",
        metadata={"warehouse_profile": record},
    )
    return {**record, "equipment": equipment}


@router.post("/bulk-receive")
def bulk_receive(
    payload: WarehouseBulkReceive,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher", "technician"))],
) -> dict[str, Any]:
    client = get_supabase()
    _require_warehouse_tables(client)
    received = []
    missing = []
    now = _now()
    for serial in _dedupe_serials(payload.serial_numbers):
        equipment = _get_equipment_by_serial(client, serial)
        if not equipment:
            missing.append(serial)
            continue
        before_region = equipment.get("region")
        client.table("equipment").update(
            {"status": "available", "region": payload.region, "assigned_at": None}
        ).eq("id", equipment["id"]).execute()
        profile = _upsert_profile(
            client,
            {
                "equipment_id": equipment["id"],
                "region": payload.region,
                "bin_location": payload.bin_location,
                "shelf_location": payload.shelf_location,
                "condition_grade": payload.condition_grade,
                "readiness_status": payload.readiness_status,
                "last_received_at": now,
                "notes": payload.notes,
                "updated_by": user.id,
            },
        )
        record_equipment_movement(
            client,
            actor_id=user.id,
            tolerate_missing_table=True,
            payload={
                "equipment_id": equipment["id"],
                "movement_type": "received_into_inventory",
                "from_location_type": "unknown",
                "from_location_label": before_region,
                "from_region": before_region,
                "to_location_type": "warehouse",
                "to_location_label": _location_label(payload.bin_location, payload.shelf_location),
                "to_region": payload.region,
                "moved_at": now,
                "notes": payload.notes or "Warehouse bulk receiving.",
            },
        )
        _log_warehouse_activity(
            client,
            actor_id=user.id,
            equipment_id=equipment["id"],
            event_type="warehouse_received",
            message=f"Warehouse received {equipment['serial_number']} into {payload.region}.",
            metadata={"profile": profile},
        )
        received.append({**equipment, "warehouse_profile": profile})
    return {"received": received, "missing_serials": missing, "received_count": len(received), "missing_count": len(missing)}


@router.post("/cycle-counts", status_code=201)
def create_cycle_count(
    payload: WarehouseCycleCountCreate,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher", "technician"))],
) -> dict[str, Any]:
    client = get_supabase()
    _require_warehouse_tables(client)
    now = _now()
    session = WarehouseCycleCountSessionRepository(client).create(
        {
            "region": payload.region,
            "bin_location": payload.bin_location,
            "shelf_location": payload.shelf_location,
            "notes": payload.notes,
            "counted_at": now,
            "created_by": user.id,
        }
    )
    items = []
    variances = []
    for item in payload.items:
        equipment = _get_equipment_by_serial(client, item.serial_number)
        expected_region = equipment.get("region") if equipment else None
        if equipment and item.found:
            profile_patch = {
                "equipment_id": equipment["id"],
                "region": payload.region,
                "bin_location": payload.bin_location,
                "shelf_location": payload.shelf_location,
                "condition_grade": item.condition_grade or "good",
                "readiness_status": _readiness_from_condition(item.condition_grade),
                "last_cycle_counted_at": now,
                "updated_by": user.id,
            }
            _upsert_profile(client, profile_patch)
        if equipment and item.observed_status:
            client.table("equipment").update({"status": item.observed_status, "region": payload.region}).eq("id", equipment["id"]).execute()
        if expected_region and expected_region != payload.region:
            variances.append({"serial_number": item.serial_number, "expected_region": expected_region, "observed_region": payload.region})
        if not equipment:
            variances.append({"serial_number": item.serial_number, "expected_region": None, "observed_region": payload.region, "reason": "Serial not found"})
        row = WarehouseCycleCountItemRepository(client).create(
            {
                "session_id": session["id"],
                "equipment_id": equipment["id"] if equipment else None,
                "serial_number": item.serial_number,
                "expected_region": expected_region,
                "observed_region": payload.region,
                "observed_status": item.observed_status,
                "condition_grade": item.condition_grade,
                "found": item.found,
                "variance_note": item.variance_note,
            }
        )
        items.append(row)
    _log_warehouse_activity(
        client,
        actor_id=user.id,
        event_type="warehouse_cycle_counted",
        message=f"Cycle count completed for {payload.region} with {len(items)} items.",
        metadata={"session_id": session["id"], "variance_count": len(variances), "variances": variances[:25]},
    )
    return {"session": session, "items": items, "variances": variances, "counted_count": len(items)}


@router.put("/redeploy-checklists")
def upsert_redeploy_checklist(
    payload: WarehouseRedeployChecklistUpsert,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher", "technician"))],
) -> dict[str, Any]:
    client = get_supabase()
    _require_warehouse_tables(client)
    equipment = _get_equipment_by_id(client, str(payload.equipment_id))
    now = _now()
    data = {
        **payload.model_dump(mode="json"),
        "completed_by": user.id,
        "completed_at": now if payload.approved_for_redeploy else None,
    }
    existing = (
        client.table("warehouse_redeploy_checklists")
        .select("*")
        .eq("equipment_id", str(payload.equipment_id))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    checklist = (
        WarehouseRedeployChecklistRepository(client).update(existing[0]["id"], data)
        if existing
        else WarehouseRedeployChecklistRepository(client).create(data)
    )
    readiness = "ready" if payload.approved_for_redeploy else _readiness_from_checklist(payload)
    condition = "ready" if payload.approved_for_redeploy else "hold"
    _upsert_profile(
        client,
        {
            "equipment_id": str(payload.equipment_id),
            "region": equipment["region"],
            "condition_grade": condition,
            "readiness_status": readiness,
            "notes": payload.notes,
            "updated_by": user.id,
        },
    )
    if payload.approved_for_redeploy and equipment["status"] in {"in_repair", "return_in_progress", "retired"}:
        client.table("equipment").update({"status": "available", "assigned_at": None}).eq("id", str(payload.equipment_id)).execute()
    _log_warehouse_activity(
        client,
        actor_id=user.id,
        equipment_id=str(payload.equipment_id),
        event_type="redeploy_checklist_completed",
        message=f"Redeploy checklist saved for {equipment['serial_number']}.",
        metadata={"approved_for_redeploy": payload.approved_for_redeploy, "readiness_status": readiness},
    )
    return {"checklist": checklist, "readiness_status": readiness}


def _warehouse_tables_available(client: SupabaseRestClient) -> bool:
    try:
        client.table("warehouse_inventory_profiles").select("equipment_id").limit(1).execute()
        return True
    except HTTPException as exc:
        return not _is_missing_table(exc)


def _require_warehouse_tables(client: SupabaseRestClient) -> None:
    if not _warehouse_tables_available(client):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Warehouse tables are not installed yet. Run supabase/014_warehouse_mode.sql in Supabase SQL Editor.",
        )


def _warehouse_fallback_inventory(
    client: SupabaseRestClient,
    *,
    region: str | None,
    search: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    query = (
        client.table("equipment")
        .select("id,serial_number,make,model,equipment_type,status,region,updated_at,added_at")
        .eq("status", "available")
        .is_("archived_at", "null")
    )
    if region:
        query = query.eq("region", region)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.or_(f"serial_number.ilike.{pattern},make.ilike.{pattern},model.ilike.{pattern}")
    equipment = query.order("updated_at", desc=True).limit(limit).execute().data or []
    return [
        {
            "equipment_id": item["id"],
            "region": item["region"],
            "bin_location": None,
            "shelf_location": None,
            "condition_grade": "good",
            "readiness_status": "ready",
            "last_received_at": None,
            "last_cycle_counted_at": None,
            "notes": "Fallback warehouse view. Run migration 014 for full warehouse controls.",
            "equipment": item,
        }
        for item in equipment
    ]


def _upsert_profile(client: SupabaseRestClient, data: dict[str, Any]) -> dict[str, Any]:
    existing = (
        client.table("warehouse_inventory_profiles")
        .select("*")
        .eq("equipment_id", data["equipment_id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        updated = (
            client.table("warehouse_inventory_profiles")
            .update(data)
            .eq("equipment_id", data["equipment_id"])
            .execute()
            .data
            or []
        )
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse profile not found.")
        return updated[0]
    return WarehouseInventoryRepository(client).create(data)


def _get_equipment_by_serial(client: SupabaseRestClient, serial_number: str) -> dict[str, Any] | None:
    rows = (
        client.table("equipment")
        .select("id,serial_number,make,model,equipment_type,status,region,updated_at,added_at")
        .ilike("serial_number", serial_number.strip())
        .is_("archived_at", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _get_equipment_by_id(client: SupabaseRestClient, equipment_id: str) -> dict[str, Any]:
    rows = client.table("equipment").select("*").eq("id", equipment_id).limit(1).execute().data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found.")
    return rows[0]


def _log_warehouse_activity(
    client: SupabaseRestClient,
    *,
    actor_id: str,
    event_type: str,
    message: str,
    metadata: dict[str, Any],
    equipment_id: str | None = None,
) -> None:
    try:
        client.table("activity_logs").insert(
            {
                "event_type": event_type,
                "actor_id": actor_id,
                "equipment_id": equipment_id,
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
                "message": message,
                "metadata": metadata,
            }
        ).execute()


def _warehouse_profile_search_text(row: dict[str, Any]) -> str:
    equipment = row.get("equipment") or {}
    return " ".join(
        str(value or "")
        for value in [
            row.get("region"),
            row.get("bin_location"),
            row.get("shelf_location"),
            row.get("condition_grade"),
            row.get("readiness_status"),
            equipment.get("serial_number"),
            equipment.get("make"),
            equipment.get("model"),
        ]
    ).lower()


def _dedupe_serials(serials: list[str]) -> list[str]:
    seen = set()
    result = []
    for serial in serials:
        clean = serial.strip()
        if clean and clean.lower() not in seen:
            seen.add(clean.lower())
            result.append(clean)
    return result


def _readiness_from_condition(condition: str | None) -> str:
    if condition in {"needs_repair"}:
        return "needs_repair"
    if condition in {"hold", "retired"}:
        return condition
    return "ready"


def _readiness_from_checklist(payload: WarehouseRedeployChecklistUpsert) -> str:
    if not payload.cleaned or not payload.sanitized:
        return "needs_cleaning"
    if not payload.battery_checked or not payload.charger_present:
        return "needs_battery"
    if not payload.physical_inspection_passed:
        return "needs_repair"
    return "hold"


def _location_label(bin_location: str | None, shelf_location: str | None) -> str:
    parts = [item for item in [bin_location, shelf_location] if item]
    return " / ".join(parts) if parts else "Warehouse"


def _parse_date(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _is_missing_table(exc: HTTPException) -> bool:
    detail = str(exc.detail).lower()
    return "does not exist" in detail or "schema cache" in detail
