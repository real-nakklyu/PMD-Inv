from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import EquipmentStatus, EquipmentType, FloridaRegion

AppointmentKind = Literal["delivery", "pickup", "service", "return", "inspection"]
AppointmentStatus = Literal["scheduled", "in_progress", "completed", "cancelled", "no_show"]
SavedViewPage = Literal["inventory", "assigned", "returns", "service_tickets", "patients", "schedule", "reports"]


class AppointmentCreate(BaseModel):
    kind: AppointmentKind
    status: AppointmentStatus = "scheduled"
    region: FloridaRegion
    scheduled_start: datetime
    scheduled_end: datetime | None = None
    patient_id: UUID | None = None
    equipment_id: UUID | None = None
    return_id: UUID | None = None
    service_ticket_id: UUID | None = None
    assigned_to: UUID | None = None
    driver_name: str | None = Field(default=None, max_length=80)
    title: str = Field(min_length=2, max_length=160)
    location_note: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=2000)


class AppointmentUpdate(BaseModel):
    kind: AppointmentKind | None = None
    status: AppointmentStatus | None = None
    region: FloridaRegion | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    patient_id: UUID | None = None
    equipment_id: UUID | None = None
    return_id: UUID | None = None
    service_ticket_id: UUID | None = None
    assigned_to: UUID | None = None
    driver_name: str | None = Field(default=None, max_length=80)
    title: str | None = Field(default=None, min_length=2, max_length=160)
    location_note: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=2000)


class AppointmentOut(AppointmentCreate):
    id: UUID
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    patients: dict[str, Any] | None = None
    equipment: dict[str, Any] | None = None

    model_config = ConfigDict(from_attributes=True)


class AvailabilityThresholdUpsert(BaseModel):
    region: FloridaRegion
    equipment_type: EquipmentType
    minimum_available: int = Field(ge=0, le=1000)
    notes: str | None = Field(default=None, max_length=1000)


class AvailabilityThresholdOut(AvailabilityThresholdUpsert):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AvailabilitySummaryItem(BaseModel):
    region: FloridaRegion
    equipment_type: EquipmentType
    available: int
    total: int
    minimum_available: int
    shortage: int
    ready_available: int = 0
    warehouse_hold: int = 0
    idle_over_30_days: int = 0
    forecasted_30_day_need: int = 0
    forecasted_shortage: int = 0
    threshold_id: UUID | None = None
    notes: str | None = None


class AvailabilityTransferRecommendation(BaseModel):
    equipment_type: EquipmentType
    from_region: FloridaRegion
    to_region: FloridaRegion
    quantity: int
    source_equipment: list[dict[str, Any]] = Field(default_factory=list)
    source_available: int
    source_minimum: int
    destination_available: int
    destination_minimum: int
    destination_shortage: int
    idle_days: int | None = None
    readiness_note: str | None = None
    reason: str


class AvailabilityProcurementNeed(BaseModel):
    region: FloridaRegion
    equipment_type: EquipmentType
    quantity: int
    available: int
    minimum_available: int
    forecasted_30_day_need: int = 0
    reason: str


class AvailabilityRecommendations(BaseModel):
    transfers: list[AvailabilityTransferRecommendation]
    procurement_needs: list[AvailabilityProcurementNeed]
    shortage_count: int
    healthy_count: int
    forecast_warning_count: int = 0


class SavedViewCreate(BaseModel):
    page: SavedViewPage
    name: str = Field(min_length=2, max_length=120)
    filters: dict[str, Any] = Field(default_factory=dict)
    is_default: bool = False


class SavedViewUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    filters: dict[str, Any] | None = None
    is_default: bool | None = None


class SavedViewOut(SavedViewCreate):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DeliverySetupChecklistUpsert(BaseModel):
    appointment_id: UUID | None = None
    assignment_id: UUID | None = None
    equipment_id: UUID
    patient_id: UUID
    region: FloridaRegion
    delivered: bool = False
    setup_completed: bool = False
    patient_or_caregiver_instructed: bool = False
    safe_operation_reviewed: bool = False
    troubleshooting_reviewed: bool = False
    cleaning_reviewed: bool = False
    maintenance_reviewed: bool = False
    charger_confirmed: bool = False
    battery_charged: bool = False
    documents_left: bool = False
    signature_name: str | None = Field(default=None, max_length=120)
    signature_data_url: str | None = None
    signed_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=2000)


class DeliverySetupChecklistOut(DeliverySetupChecklistUpsert):
    id: UUID
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


WarehouseConditionGrade = Literal["new", "ready", "good", "fair", "needs_repair", "hold", "retired"]
WarehouseReadinessStatus = Literal["ready", "needs_cleaning", "needs_battery", "needs_repair", "hold", "retired"]


class WarehouseProfileUpsert(BaseModel):
    equipment_id: UUID
    region: FloridaRegion
    bin_location: str | None = Field(default=None, max_length=80)
    shelf_location: str | None = Field(default=None, max_length=80)
    condition_grade: WarehouseConditionGrade = "good"
    readiness_status: WarehouseReadinessStatus = "ready"
    notes: str | None = Field(default=None, max_length=2000)


class WarehouseProfileOut(WarehouseProfileUpsert):
    last_received_at: datetime | None = None
    last_cycle_counted_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    equipment: dict[str, Any] | None = None


class WarehouseBulkReceive(BaseModel):
    serial_numbers: list[str] = Field(min_length=1, max_length=100)
    region: FloridaRegion
    bin_location: str | None = Field(default=None, max_length=80)
    shelf_location: str | None = Field(default=None, max_length=80)
    condition_grade: WarehouseConditionGrade = "good"
    readiness_status: WarehouseReadinessStatus = "ready"
    notes: str | None = Field(default=None, max_length=2000)


class WarehouseCycleCountItemIn(BaseModel):
    serial_number: str = Field(min_length=1, max_length=120)
    found: bool = True
    observed_status: EquipmentStatus | None = None
    condition_grade: WarehouseConditionGrade | None = None
    variance_note: str | None = Field(default=None, max_length=1000)


class WarehouseCycleCountCreate(BaseModel):
    region: FloridaRegion
    bin_location: str | None = Field(default=None, max_length=80)
    shelf_location: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=2000)
    items: list[WarehouseCycleCountItemIn] = Field(min_length=1, max_length=300)


class WarehouseRedeployChecklistUpsert(BaseModel):
    equipment_id: UUID
    cleaned: bool = False
    sanitized: bool = False
    battery_checked: bool = False
    charger_present: bool = False
    physical_inspection_passed: bool = False
    paperwork_ready: bool = False
    approved_for_redeploy: bool = False
    notes: str | None = Field(default=None, max_length=2000)


class WarehouseReadinessSummary(BaseModel):
    ready: int
    needs_attention: int
    hold: int
    counted_last_30_days: int
    migration_required: bool = False
