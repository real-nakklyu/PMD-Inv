from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import (
    AssignmentStatus,
    FloridaRegion,
    ReturnStatus,
    ServicePriority,
    ServiceTicketStatus,
)


class AssignmentCreate(BaseModel):
    equipment_id: UUID
    patient_id: UUID
    region: FloridaRegion
    notes: str | None = Field(default=None, max_length=1000)


class AssignmentOut(BaseModel):
    id: UUID
    equipment_id: UUID
    patient_id: UUID
    region: FloridaRegion
    status: AssignmentStatus
    assigned_at: datetime
    ended_at: datetime | None = None
    notes: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ReturnCreate(BaseModel):
    equipment_id: UUID
    patient_id: UUID
    assignment_id: UUID | None = None
    scheduled_at: datetime | None = None
    pickup_address: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)


class ReturnStatusUpdate(BaseModel):
    status: ReturnStatus
    notes: str | None = Field(default=None, max_length=1000)


class ReturnInspectionUpdate(BaseModel):
    cleaned: bool = False
    sanitized: bool = False
    battery_tested: bool = False
    charger_verified: bool = False
    damage_found: bool = False
    repair_ticket_created: bool = False
    approved_for_restock: bool = False
    notes: str | None = Field(default=None, max_length=2000)


class ReturnOut(BaseModel):
    id: UUID
    equipment_id: UUID
    patient_id: UUID
    assignment_id: UUID | None = None
    status: ReturnStatus
    requested_at: datetime
    scheduled_at: datetime | None = None
    received_at: datetime | None = None
    closed_at: datetime | None = None
    pickup_address: str | None = None
    notes: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ServiceTicketCreate(BaseModel):
    equipment_id: UUID
    patient_id: UUID | None = None
    assignment_id: UUID | None = None
    priority: ServicePriority = "medium"
    issue_description: str = Field(min_length=5, max_length=4000)


class ServiceTicketUpdate(BaseModel):
    priority: ServicePriority | None = None
    status: ServiceTicketStatus | None = None
    repair_notes: str | None = Field(default=None, max_length=4000)
    repair_completed: bool | None = None

    @model_validator(mode="after")
    def validate_repair_resolution(self):
        if self.repair_completed and not self.repair_notes:
            raise ValueError("Repair notes are required when marking a completed repair.")
        return self


class ServiceTicketOut(BaseModel):
    id: UUID
    equipment_id: UUID
    patient_id: UUID | None = None
    assignment_id: UUID | None = None
    priority: ServicePriority
    status: ServiceTicketStatus
    issue_description: str
    repair_notes: str | None = None
    repair_completed: bool
    opened_at: datetime
    updated_status_at: datetime
    resolved_at: datetime | None = None
    closed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
