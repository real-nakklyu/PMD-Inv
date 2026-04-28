from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import FloridaRegion


class PatientCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    date_of_birth: date
    region: FloridaRegion
    address_line1: str | None = Field(default=None, max_length=160)
    address_line2: str | None = Field(default=None, max_length=160)
    city: str | None = Field(default=None, max_length=100)
    state: str = Field(default="FL", min_length=2, max_length=40)
    postal_code: str | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=4000)


class PatientUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    date_of_birth: date | None = None
    region: FloridaRegion | None = None
    address_line1: str | None = Field(default=None, max_length=160)
    address_line2: str | None = Field(default=None, max_length=160)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, min_length=2, max_length=40)
    postal_code: str | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=4000)


class PatientOut(BaseModel):
    id: UUID
    full_name: str
    date_of_birth: date
    region: FloridaRegion
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str = "FL"
    postal_code: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PatientNoteCreate(BaseModel):
    body: str = Field(min_length=2, max_length=4000)

    @field_validator("body", mode="before")
    @classmethod
    def normalize_body(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class PatientNoteOut(BaseModel):
    id: UUID
    patient_id: UUID
    body: str
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    profiles: dict | None = None

    model_config = ConfigDict(from_attributes=True)
