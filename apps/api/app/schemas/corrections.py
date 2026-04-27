from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import FloridaRegion


CorrectionEquipmentStatus = Literal["available", "return_in_progress", "in_repair", "retired"]
RestoreEquipmentStatus = Literal["available", "in_repair"]


class CorrectionIssue(BaseModel):
    id: str
    severity: Literal["critical", "warning", "info"]
    title: str
    detail: str
    action: str
    href: str | None = None


class CorrectionOverview(BaseModel):
    counts: dict[str, int]
    issues: list[CorrectionIssue]
    recent_corrections: list[dict]


class AssignmentCorrectionRequest(BaseModel):
    assignment_id: UUID
    equipment_status: CorrectionEquipmentStatus = "available"
    note: str = Field(min_length=3, max_length=1000)

    @model_validator(mode="after")
    def assigned_is_not_an_end_state(self):
        if self.equipment_status == "assigned":
            raise ValueError("Ended assignments cannot leave equipment assigned.")
        return self


class EquipmentRegionCorrectionRequest(BaseModel):
    equipment_id: UUID
    region: FloridaRegion
    note: str = Field(min_length=3, max_length=1000)
    sync_active_assignment: bool = True
    sync_active_patient: bool = False


class EquipmentRetireRequest(BaseModel):
    equipment_id: UUID
    note: str = Field(min_length=3, max_length=1000)
    end_active_assignments: bool = True


class EquipmentRestoreRequest(BaseModel):
    equipment_id: UUID
    status: RestoreEquipmentStatus = "available"
    region: FloridaRegion | None = None
    note: str = Field(min_length=3, max_length=1000)


class MovementReconcileRequest(BaseModel):
    equipment_id: UUID
    note: str = Field(min_length=3, max_length=1000)


class PatientMergeRequest(BaseModel):
    source_patient_id: UUID
    target_patient_id: UUID
    note: str = Field(min_length=3, max_length=1000)

    @model_validator(mode="after")
    def patients_must_differ(self):
        if self.source_patient_id == self.target_patient_id:
            raise ValueError("Choose two different patients to merge.")
        return self
