from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MessageThreadCreate(BaseModel):
    member_ids: list[UUID] = Field(min_length=1, max_length=25)
    title: str | None = Field(default=None, max_length=120)
    thread_type: str = Field(default="direct", pattern="^(direct|group)$")


class MessageThreadMembersAdd(BaseModel):
    member_ids: list[UUID] = Field(min_length=1, max_length=25)


class MessageCreate(BaseModel):
    body: str = Field(default="", max_length=4000)


class MessageAttachmentCreate(BaseModel):
    storage_path: str = Field(min_length=3, max_length=600)
    file_name: str = Field(min_length=1, max_length=255)
    mime_type: str | None = Field(default=None, max_length=180)
    file_size: int | None = Field(default=None, ge=0)
    bucket: str = "service-attachments"


class MessageAttachmentOut(BaseModel):
    id: UUID
    message_id: UUID
    bucket: str
    storage_path: str
    file_name: str
    mime_type: str | None = None
    file_size: int | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
