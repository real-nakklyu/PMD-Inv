from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import ServicePriority

MaintenanceTaskStatus = Literal["due", "scheduled", "completed", "skipped", "cancelled"]
MaintenanceTaskType = Literal[
    "battery_check",
    "charger_check",
    "safety_inspection",
    "cleaning_sanitization",
    "tire_brake_check",
    "annual_pm",
    "other",
]


class PreventiveMaintenanceCreate(BaseModel):
    equipment_id: UUID
    service_ticket_id: UUID | None = None
    task_type: MaintenanceTaskType
    status: MaintenanceTaskStatus = "due"
    priority: ServicePriority = "medium"
    due_at: datetime
    scheduled_at: datetime | None = None
    odometer_hours: float | None = Field(default=None, ge=0)
    battery_voltage: float | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=2000)


class PreventiveMaintenanceUpdate(BaseModel):
    service_ticket_id: UUID | None = None
    task_type: MaintenanceTaskType | None = None
    status: MaintenanceTaskStatus | None = None
    priority: ServicePriority | None = None
    due_at: datetime | None = None
    scheduled_at: datetime | None = None
    completed_at: datetime | None = None
    odometer_hours: float | None = Field(default=None, ge=0)
    battery_voltage: float | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=2000)
    completion_notes: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def validate_completion_notes(self):
        if self.status == "completed" and not self.completion_notes:
            raise ValueError("Completion notes are required when completing preventive maintenance.")
        return self


class PreventiveMaintenanceOut(BaseModel):
    id: UUID
    equipment_id: UUID
    service_ticket_id: UUID | None = None
    task_type: MaintenanceTaskType
    status: MaintenanceTaskStatus
    priority: ServicePriority
    due_at: datetime
    scheduled_at: datetime | None = None
    completed_at: datetime | None = None
    odometer_hours: float | None = None
    battery_voltage: float | None = None
    notes: str | None = None
    completion_notes: str | None = None
    created_by: UUID | None = None
    completed_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    equipment: dict | None = None
    service_tickets: dict | None = None

    model_config = ConfigDict(from_attributes=True)
