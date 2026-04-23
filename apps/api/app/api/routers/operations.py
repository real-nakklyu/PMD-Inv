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
    AvailabilitySummaryItem,
    AvailabilityThresholdOut,
    AvailabilityThresholdUpsert,
    DeliverySetupChecklistOut,
    DeliverySetupChecklistUpsert,
    SavedViewCreate,
    SavedViewOut,
    SavedViewUpdate,
)
from app.services.audit import log_change_activity

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
    client = get_supabase()
    equipment = client.table("equipment").select("region,equipment_type,status").is_("archived_at", "null").execute().data or []
    thresholds = client.table("availability_thresholds").select("*").execute().data or []
    threshold_map = {(item["region"], item["equipment_type"]): item for item in thresholds}
    rows: list[dict[str, Any]] = []
    for region in florida_regions:
        for equipment_type in ("power_wheelchair", "scooter"):
            matching = [item for item in equipment if item["region"] == region and item["equipment_type"] == equipment_type]
            available = len([item for item in matching if item["status"] == "available"])
            threshold = threshold_map.get((region, equipment_type))
            minimum = int(threshold.get("minimum_available", 0)) if threshold else 0
            rows.append(
                {
                    "region": region,
                    "equipment_type": equipment_type,
                    "available": available,
                    "total": len(matching),
                    "minimum_available": minimum,
                    "shortage": max(0, minimum - available),
                    "threshold_id": threshold.get("id") if threshold else None,
                    "notes": threshold.get("notes") if threshold else None,
                }
            )
    return rows


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
