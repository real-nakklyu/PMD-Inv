from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

EquipmentCostEventType = Literal[
    "purchase",
    "repair_parts",
    "repair_labor",
    "transport",
    "maintenance",
    "warranty_credit",
    "adjustment",
]


class EquipmentCostEventCreate(BaseModel):
    equipment_id: UUID
    service_ticket_id: UUID | None = None
    maintenance_task_id: UUID | None = None
    event_type: EquipmentCostEventType
    amount: Decimal
    vendor: str | None = Field(default=None, max_length=160)
    invoice_number: str | None = Field(default=None, max_length=120)
    occurred_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_amount(self):
        if self.amount == 0:
            raise ValueError("Amount cannot be zero.")
        return self


class EquipmentCostEventOut(EquipmentCostEventCreate):
    id: UUID
    occurred_at: datetime
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    equipment: dict | None = None
    service_tickets: dict | None = None

    model_config = ConfigDict(from_attributes=True)
