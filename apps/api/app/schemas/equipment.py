from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import EquipmentStatus, EquipmentType, FloridaRegion


class EquipmentCreate(BaseModel):
    equipment_type: EquipmentType
    make: str = Field(min_length=2, max_length=80)
    model: str = Field(min_length=1, max_length=80)
    serial_number: str = Field(min_length=3, max_length=120)
    bought_price: Decimal = Field(ge=0)
    status: EquipmentStatus = "available"
    region: FloridaRegion
    notes: str | None = Field(default=None, max_length=2000)


class EquipmentUpdate(BaseModel):
    make: str | None = Field(default=None, min_length=2, max_length=80)
    model: str | None = Field(default=None, min_length=1, max_length=80)
    serial_number: str | None = Field(default=None, min_length=3, max_length=120)
    bought_price: Decimal | None = Field(default=None, ge=0)
    status: EquipmentStatus | None = None
    region: FloridaRegion | None = None
    notes: str | None = Field(default=None, max_length=2000)


class EquipmentOut(BaseModel):
    id: UUID
    equipment_type: EquipmentType
    make: str
    model: str
    serial_number: str
    bought_price: Decimal
    status: EquipmentStatus
    region: FloridaRegion
    added_at: datetime
    assigned_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EquipmentListOut(BaseModel):
    items: list[EquipmentOut]
    total: int
    limit: int
    offset: int
