from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import FloridaRegion

EquipmentMovementType = Literal[
    "received_into_inventory",
    "warehouse_to_driver",
    "driver_to_patient",
    "patient_to_return",
    "return_to_warehouse",
    "warehouse_to_repair",
    "repair_to_warehouse",
    "region_transfer",
    "manual_adjustment",
    "retired",
]

EquipmentLocationType = Literal[
    "warehouse",
    "driver",
    "patient",
    "repair",
    "return_in_transit",
    "retired",
    "unknown",
]


class EquipmentMovementCreate(BaseModel):
    equipment_id: UUID
    movement_type: EquipmentMovementType
    from_location_type: EquipmentLocationType = "unknown"
    from_location_label: str | None = Field(default=None, max_length=160)
    from_region: FloridaRegion | None = None
    to_location_type: EquipmentLocationType
    to_location_label: str | None = Field(default=None, max_length=160)
    to_region: FloridaRegion | None = None
    patient_id: UUID | None = None
    assignment_id: UUID | None = None
    return_id: UUID | None = None
    appointment_id: UUID | None = None
    service_ticket_id: UUID | None = None
    moved_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=2000)


class EquipmentMovementOut(EquipmentMovementCreate):
    id: UUID
    moved_at: datetime
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    equipment: dict | None = None
    patients: dict | None = None

    model_config = ConfigDict(from_attributes=True)
