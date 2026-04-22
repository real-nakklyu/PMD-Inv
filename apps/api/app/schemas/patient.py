from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import FloridaRegion


class PatientCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    date_of_birth: date
    region: FloridaRegion


class PatientUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    date_of_birth: date | None = None
    region: FloridaRegion | None = None


class PatientOut(BaseModel):
    id: UUID
    full_name: str
    date_of_birth: date
    region: FloridaRegion
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
