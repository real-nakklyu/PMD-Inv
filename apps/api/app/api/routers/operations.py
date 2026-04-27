from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from fastapi import status as http_status

from app.core.auth import AuthUser, get_current_user, require_roles
from app.db.supabase import get_supabase
from app.repositories.simple import AppointmentRepository, AvailabilityThresholdRepository, DeliverySetupChecklistRepository, SavedViewRepository
from app.schemas.common import FloridaRegion, florida_regions
from app.schemas.operations import (
    AppointmentCreate,
    AppointmentOut,
    AppointmentUpdate,
    AvailabilityRecommendations,
    AvailabilityProcurementNeed,
    AvailabilitySummaryItem,
    AvailabilityThresholdOut,
    AvailabilityThresholdUpsert,
    AvailabilityTransferRecommendation,
    DeliverySetupChecklistOut,
    DeliverySetupChecklistUpsert,
    SavedViewCreate,
    SavedViewOut,
    SavedViewUpdate,
)
from app.services.audit import log_change_activity
from app.services.movements import maybe_record_delivery_completion_movement

router = APIRouter(tags=["operations"])


@router.get("/appointments", response_model=list[AppointmentOut])
def list_appointments(
    _: Annotated[AuthUser, Depends(get_current_user)],
    region: Annotated[FloridaRegion | None, Query()] = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
):
    query = AppointmentRepository(get_supabase()).table.select(
        "*, patients(full_name,date_of_birth,region), equipment(serial_number,make,model,equipment_type,status)"
    )
    if region:
        query = query.eq("region", region)
    if status:
        query = query.eq("status", status)
    return query.order("scheduled_start", desc=False).range(offset, offset + limit - 1).execute().data or []


@router.post("/appointments", response_model=AppointmentOut, status_code=201)
def create_appointment(
    payload: AppointmentCreate,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher", "technician"))],
):
    client = get_supabase()
    record = AppointmentRepository(client).create({**payload.model_dump(mode="json"), "created_by": user.id})
    client.table("activity_logs").insert(
        {
            "event_type": "appointment_created",
            "actor_id": user.id,
            "equipment_id": record.get("equipment_id"),
            "patient_id": record.get("patient_id"),
            "return_id": record.get("return_id"),
            "service_ticket_id": record.get("service_ticket_id"),
            "message": f"Appointment created: {record['title']}.",
            "metadata": {"kind": record["kind"], "status": record["status"], "scheduled_start": record["scheduled_start"]},
        }
    ).execute()
    return record


@router.patch("/appointments/{appointment_id}", response_model=AppointmentOut)
def update_appointment(
    appointment_id: str,
    payload: AppointmentUpdate,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher", "technician"))],
):
    client = get_supabase()
    before = AppointmentRepository(client).get(appointment_id)
    data = payload.model_dump(mode="json", exclude_unset=True)
    record = AppointmentRepository(client).update(appointment_id, data)
    maybe_record_delivery_completion_movement(client, actor_id=user.id, before=before, after=record)
    log_change_activity(
        client,
        event_type="appointment_status_changed",
        actor_id=user.id,
        before=before,
        after=record,
        fields=list(data.keys()),
        equipment_id=record.get("equipment_id"),
        patient_id=record.get("patient_id"),
        return_id=record.get("return_id"),
        service_ticket_id=record.get("service_ticket_id"),
        message=f"Appointment updated: {record['title']}.",
    )
    return record


@router.delete("/appointments/{appointment_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_appointment(appointment_id: str, _: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher"))]):
    AppointmentRepository(get_supabase()).delete(appointment_id)


@router.get("/availability-thresholds", response_model=list[AvailabilityThresholdOut])
def list_thresholds(_: Annotated[AuthUser, Depends(get_current_user)]):
    return AvailabilityThresholdRepository(get_supabase()).table.select("*").order("region").execute().data or []


@router.get("/availability-thresholds/summary", response_model=list[AvailabilitySummaryItem])
def availability_summary(_: Annotated[AuthUser, Depends(get_current_user)]):
    return _availability_rows()


@router.get("/availability-thresholds/recommendations", response_model=AvailabilityRecommendations)
def availability_recommendations(_: Annotated[AuthUser, Depends(get_current_user)]):
    client = get_supabase()
    rows = [AvailabilitySummaryItem(**row) for row in _availability_rows()]
    available_equipment = (
        client.table("equipment")
        .select("id,serial_number,make,model,region,equipment_type,status,updated_at")
        .eq("status", "available")
        .is_("archived_at", "null")
        .order("updated_at", desc=False)
        .limit(1000)
        .execute()
        .data
        or []
    )
    warehouse_profiles = _warehouse_profiles_by_equipment(client)
    available_by_region_type: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for item in available_equipment:
        profile = warehouse_profiles.get(item["id"])
        item["warehouse_profile"] = profile
        item["idle_days"] = _idle_days(item)
        item["ready_for_redeploy"] = not profile or profile.get("readiness_status") == "ready"
        if profile and profile.get("readiness_status") not in {None, "ready"}:
            continue
        available_by_region_type.setdefault((item["region"], item["equipment_type"]), []).append(item)
    for key in available_by_region_type:
        available_by_region_type[key] = sorted(available_by_region_type[key], key=lambda item: item.get("idle_days", 0), reverse=True)

    shortages = sorted([row for row in rows if row.shortage > 0], key=lambda item: (-item.shortage, item.region))
    surplus_by_type: dict[str, list[AvailabilitySummaryItem]] = {}
    for row in rows:
        surplus = row.available - row.minimum_available
        if surplus > 0:
            surplus_by_type.setdefault(row.equipment_type, []).append(row)

    remaining_surplus = {
        (row.region, row.equipment_type): row.available - row.minimum_available
        for row in rows
        if row.available > row.minimum_available
    }
    transfers: list[AvailabilityTransferRecommendation] = []
    procurement_needs: list[AvailabilityProcurementNeed] = []

    for shortage in shortages:
        remaining_shortage = shortage.shortage
        sources = sorted(
            surplus_by_type.get(shortage.equipment_type, []),
            key=lambda row: (-(remaining_surplus.get((row.region, row.equipment_type), 0)), row.region),
        )
        for source in sources:
            if source.region == shortage.region or remaining_shortage <= 0:
                continue
            source_key = (source.region, source.equipment_type)
            surplus = remaining_surplus.get(source_key, 0)
            if surplus <= 0:
                continue
            quantity = min(remaining_shortage, surplus)
            candidates = available_by_region_type.get(source_key, [])[:quantity]
            available_by_region_type[source_key] = available_by_region_type.get(source_key, [])[quantity:]
            transfers.append(
                AvailabilityTransferRecommendation(
                    equipment_type=shortage.equipment_type,
                    from_region=source.region,
                    to_region=shortage.region,
                    quantity=quantity,
                    source_equipment=[
                        {
                            "id": item["id"],
                            "serial_number": item["serial_number"],
                            "make": item["make"],
                            "model": item["model"],
                            "idle_days": item.get("idle_days", 0),
                            "bin_location": (item.get("warehouse_profile") or {}).get("bin_location"),
                            "shelf_location": (item.get("warehouse_profile") or {}).get("shelf_location"),
                            "condition_grade": (item.get("warehouse_profile") or {}).get("condition_grade"),
                            "readiness_status": (item.get("warehouse_profile") or {}).get("readiness_status", "ready"),
                        }
                        for item in candidates
                    ],
                    source_available=source.available,
                    source_minimum=source.minimum_available,
                    destination_available=shortage.available,
                    destination_minimum=shortage.minimum_available,
                    destination_shortage=shortage.shortage,
                    idle_days=max([item.get("idle_days", 0) for item in candidates], default=None),
                    readiness_note="Only ready-for-redeploy units are recommended when warehouse readiness data is installed.",
                    reason=f"{source.region} has {_unit_label(surplus)} above target while {shortage.region} is short {_unit_label(shortage.shortage)}.",
                )
            )
            remaining_surplus[source_key] = surplus - quantity
            remaining_shortage -= quantity

        if remaining_shortage > 0:
            procurement_needs.append(
                AvailabilityProcurementNeed(
                    region=shortage.region,
                    equipment_type=shortage.equipment_type,
                    quantity=remaining_shortage,
                    available=shortage.available,
                    minimum_available=shortage.minimum_available,
                    forecasted_30_day_need=shortage.forecasted_30_day_need,
                    reason="No matching region has enough surplus available to fully cover this shortage.",
                )
            )

    return AvailabilityRecommendations(
        transfers=transfers,
        procurement_needs=procurement_needs,
        shortage_count=len(shortages),
        healthy_count=len([row for row in rows if row.shortage == 0 and row.minimum_available > 0]),
        forecast_warning_count=len([row for row in rows if row.forecasted_shortage > 0]),
    )


@router.put("/availability-thresholds", response_model=AvailabilityThresholdOut)
def upsert_threshold(
    payload: AvailabilityThresholdUpsert,
    user: Annotated[AuthUser, Depends(require_roles("admin"))],
):
    client = get_supabase()
    repo = AvailabilityThresholdRepository(client)
    existing = (
        repo.table.select("*")
        .eq("region", payload.region)
        .eq("equipment_type", payload.equipment_type)
        .limit(1)
        .execute()
        .data
        or []
    )
    data = {**payload.model_dump(mode="json"), "created_by": user.id}
    record = repo.update(existing[0]["id"], data) if existing else repo.create(data)
    before = existing[0] if existing else {}
    client.table("activity_logs").insert(
        {
            "event_type": "threshold_changed",
            "actor_id": user.id,
            "message": f"Availability threshold set for {record['region']} {record['equipment_type']}.",
            "metadata": {
                "minimum_available": record["minimum_available"],
                "changes": {
                    key: {"before": before.get(key), "after": record.get(key)}
                    for key in ("minimum_available", "notes")
                    if before.get(key) != record.get(key)
                },
            },
        }
    ).execute()
    return record


@router.get("/delivery-checklists", response_model=list[DeliverySetupChecklistOut])
def list_delivery_checklists(
    _: Annotated[AuthUser, Depends(get_current_user)],
    appointment_id: str | None = None,
    equipment_id: str | None = None,
    patient_id: str | None = None,
    limit: int = 50,
):
    query = DeliverySetupChecklistRepository(get_supabase()).table.select("*")
    if appointment_id:
        query = query.eq("appointment_id", appointment_id)
    if equipment_id:
        query = query.eq("equipment_id", equipment_id)
    if patient_id:
        query = query.eq("patient_id", patient_id)
    return query.order("created_at", desc=True).limit(limit).execute().data or []


@router.put("/delivery-checklists", response_model=DeliverySetupChecklistOut)
def upsert_delivery_checklist(
    payload: DeliverySetupChecklistUpsert,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher", "technician"))],
):
    client = get_supabase()
    repo = DeliverySetupChecklistRepository(client)
    existing: list[dict[str, Any]] = []
    if payload.appointment_id:
        existing = repo.table.select("*").eq("appointment_id", str(payload.appointment_id)).limit(1).execute().data or []
    data = {**payload.model_dump(mode="json"), "created_by": user.id}
    before = existing[0] if existing else {}
    record = repo.update(existing[0]["id"], data) if existing else repo.create(data)
    log_change_activity(
        client,
        event_type="delivery_setup_completed",
        actor_id=user.id,
        before=before,
        after=record,
        fields=list(payload.model_dump(mode="json").keys()),
        equipment_id=record["equipment_id"],
        patient_id=record["patient_id"],
        assignment_id=record.get("assignment_id"),
        message=f"Delivery/setup checklist saved for {record['region']}.",
    )
    return record


@router.get("/saved-views", response_model=list[SavedViewOut])
def list_saved_views(user: Annotated[AuthUser, Depends(get_current_user)], page: str | None = None):
    query = SavedViewRepository(get_supabase()).table.select("*").eq("user_id", user.id)
    if page:
        query = query.eq("page", page)
    return query.order("created_at", desc=True).execute().data or []


@router.post("/saved-views", response_model=SavedViewOut, status_code=201)
def create_saved_view(payload: SavedViewCreate, user: Annotated[AuthUser, Depends(get_current_user)]):
    return SavedViewRepository(get_supabase()).create({**payload.model_dump(mode="json"), "user_id": user.id})


@router.patch("/saved-views/{view_id}", response_model=SavedViewOut)
def update_saved_view(view_id: str, payload: SavedViewUpdate, user: Annotated[AuthUser, Depends(get_current_user)]):
    repo = SavedViewRepository(get_supabase())
    current = repo.get(view_id)
    if current["user_id"] != user.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only update your own saved views.")
    return repo.update(view_id, payload.model_dump(mode="json", exclude_unset=True))


@router.delete("/saved-views/{view_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_saved_view(view_id: str, user: Annotated[AuthUser, Depends(get_current_user)]):
    repo = SavedViewRepository(get_supabase())
    current = repo.get(view_id)
    if current["user_id"] != user.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own saved views.")
    repo.delete(view_id)


def _availability_rows() -> list[dict[str, Any]]:
    client = get_supabase()
    equipment = client.table("equipment").select("id,region,equipment_type,status,updated_at,added_at").is_("archived_at", "null").execute().data or []
    thresholds = client.table("availability_thresholds").select("*").execute().data or []
    warehouse_profiles = _warehouse_profiles_by_equipment(client)
    recent_assignments = _recent_assignment_demand(client)
    threshold_map = {(item["region"], item["equipment_type"]): item for item in thresholds}
    rows: list[dict[str, Any]] = []
    for region in florida_regions:
        for equipment_type in ("power_wheelchair", "scooter"):
            matching = [item for item in equipment if item["region"] == region and item["equipment_type"] == equipment_type]
            available = len([item for item in matching if item["status"] == "available"])
            ready_available = len(
                [
                    item
                    for item in matching
                    if item["status"] == "available"
                    and (not warehouse_profiles.get(item["id"]) or warehouse_profiles[item["id"]].get("readiness_status") == "ready")
                ]
            )
            warehouse_hold = len(
                [
                    item
                    for item in matching
                    if (warehouse_profiles.get(item["id"]) or {}).get("readiness_status") in {"hold", "needs_cleaning", "needs_battery", "needs_repair", "retired"}
                ]
            )
            idle_over_30 = len([item for item in matching if item["status"] == "available" and _idle_days(item) >= 30])
            threshold = threshold_map.get((region, equipment_type))
            minimum = int(threshold.get("minimum_available", 0)) if threshold else 0
            demand = recent_assignments.get((region, equipment_type), 0)
            forecasted_need = max(minimum, demand)
            rows.append(
                {
                    "region": region,
                    "equipment_type": equipment_type,
                    "available": available,
                    "total": len(matching),
                    "minimum_available": minimum,
                    "shortage": max(0, minimum - ready_available),
                    "ready_available": ready_available,
                    "warehouse_hold": warehouse_hold,
                    "idle_over_30_days": idle_over_30,
                    "forecasted_30_day_need": forecasted_need,
                    "forecasted_shortage": max(0, forecasted_need - ready_available),
                    "threshold_id": threshold.get("id") if threshold else None,
                    "notes": threshold.get("notes") if threshold else None,
                }
            )
    return rows


def _unit_label(count: int) -> str:
    return f"{count} {'unit' if count == 1 else 'units'}"


def _warehouse_profiles_by_equipment(client) -> dict[str, dict[str, Any]]:
    try:
        rows = client.table("warehouse_inventory_profiles").select("*").execute().data or []
    except Exception as exc:
        if "warehouse_inventory_profiles" not in str(exc).lower():
            raise
        return {}
    return {row["equipment_id"]: row for row in rows}


def _recent_assignment_demand(client) -> dict[tuple[str, str], int]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    try:
        rows = (
            client.table("assignments")
            .select("region,equipment(equipment_type)")
            .gte("assigned_at", cutoff)
            .execute()
            .data
            or []
        )
    except Exception:
        return {}
    counts: dict[tuple[str, str], int] = {}
    for row in rows:
        equipment_type = (row.get("equipment") or {}).get("equipment_type")
        if equipment_type:
            key = (row["region"], equipment_type)
            counts[key] = counts.get(key, 0) + 1
    return counts


def _idle_days(item: dict[str, Any]) -> int:
    raw = item.get("updated_at") or item.get("added_at")
    if not raw:
        return 0
    try:
        updated = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return 0
    return max(0, (datetime.now(timezone.utc) - updated).days)
