from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

StaffRole = Literal["admin", "dispatcher", "technician", "viewer"]


class ProfileBootstrap(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    role: StaffRole | None = None


class StaffAccessRequestCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    requested_role: StaffRole = "viewer"
    message: str | None = Field(default=None, max_length=1000)


class StaffAccessRequestReview(BaseModel):
    action: Literal["approve", "deny"]
    role: StaffRole = "viewer"


class ProfileOut(BaseModel):
    id: UUID
    full_name: str
    role: StaffRole
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StaffAccessRequestOut(BaseModel):
    id: UUID
    user_id: UUID
    email: str
    full_name: str
    requested_role: StaffRole
    message: str | None
    status: Literal["pending", "approved", "denied"]
    reviewed_by: UUID | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
