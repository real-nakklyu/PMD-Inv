from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import FloridaRegion, ServicePriority

HandoffNoteType = Literal["dispatch", "driver", "repair", "inventory", "admin"]
HandoffNoteStatus = Literal["open", "resolved", "archived"]


class HandoffNoteCreate(BaseModel):
    note_type: HandoffNoteType = "dispatch"
    status: HandoffNoteStatus = "open"
    priority: ServicePriority = "medium"
    region: FloridaRegion | None = None
    title: str = Field(min_length=2, max_length=160)
    body: str = Field(min_length=2, max_length=4000)
    context_label: str | None = Field(default=None, max_length=240)
    equipment_id: UUID | None = None
    patient_id: UUID | None = None
    appointment_id: UUID | None = None
    service_ticket_id: UUID | None = None


class HandoffNoteUpdate(BaseModel):
    note_type: HandoffNoteType | None = None
    status: HandoffNoteStatus | None = None
    priority: ServicePriority | None = None
    region: FloridaRegion | None = None
    title: str | None = Field(default=None, min_length=2, max_length=160)
    body: str | None = Field(default=None, min_length=2, max_length=4000)
    context_label: str | None = Field(default=None, max_length=240)

    @model_validator(mode="after")
    def require_content_for_open_notes(self):
        if self.status == "open" and self.title == "":
            raise ValueError("Open handoff notes need a title.")
        return self


class HandoffNoteOut(HandoffNoteCreate):
    id: UUID
    created_by: UUID | None = None
    resolved_by: UUID | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    profiles: dict | None = None
    equipment: dict | None = None
    patients: dict | None = None

    model_config = ConfigDict(from_attributes=True)
