from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status

from app.db.supabase import SupabaseRestClient
from app.repositories.equipment import EquipmentRepository
from app.repositories.simple import (
    ActivityRepository,
    AssignmentRepository,
    ReturnRepository,
    ServiceTicketRepository,
)
from app.services.audit import build_change_set

RETURN_TRANSITIONS = {
    "requested": {"scheduled", "pickup_pending", "cancelled"},
    "scheduled": {"pickup_pending", "in_transit", "cancelled"},
    "pickup_pending": {"in_transit", "cancelled"},
    "in_transit": {"received", "cancelled"},
    "received": {"inspected"},
    "inspected": {"restocked", "closed"},
    "restocked": {"closed"},
    "closed": set(),
    "cancelled": set(),
}

SERVICE_TRANSITIONS = {
    "open": {"open", "scheduled", "waiting_parts", "in_progress", "resolved", "closed", "cancelled"},
    "scheduled": {"open", "scheduled", "waiting_parts", "in_progress", "resolved", "closed", "cancelled"},
    "waiting_parts": {"open", "scheduled", "waiting_parts", "in_progress", "resolved", "closed", "cancelled"},
    "in_progress": {"open", "scheduled", "waiting_parts", "in_progress", "resolved", "closed", "cancelled"},
    "resolved": {"open", "scheduled", "waiting_parts", "in_progress", "resolved", "closed", "cancelled"},
    "closed": {"open", "scheduled", "waiting_parts", "in_progress", "resolved", "closed", "cancelled"},
    "cancelled": {"open", "scheduled", "waiting_parts", "in_progress", "resolved", "closed", "cancelled"},
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class WorkflowService:
    def __init__(self, client: SupabaseRestClient):
        self.client = client
        self.equipment = EquipmentRepository(client)
        self.assignments = AssignmentRepository(client)
        self.returns = ReturnRepository(client)
        self.tickets = ServiceTicketRepository(client)
        self.activity = ActivityRepository(client)

    def create_assignment(self, payload: dict[str, Any], actor_id: str) -> dict[str, Any]:
        equipment = self.equipment.get(payload["equipment_id"])
        if equipment["status"] != "available":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only available equipment can be assigned.",
            )

        if self.equipment.get_active_assignment(payload["equipment_id"]):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Equipment already has an active assignment.",
            )

        active_patient_assignment = (
            self.client.table("assignments")
            .select("id")
            .eq("patient_id", payload["patient_id"])
            .in_("status", ["active", "return_in_progress"])
            .limit(1)
            .execute()
            .data
            or []
        )
        if active_patient_assignment:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This patient already has an active equipment assignment.",
            )

        assignment = self.assignments.create({**payload, "created_by": actor_id})
        assigned_at = assignment["assigned_at"]
        self.equipment.update(
            payload["equipment_id"],
            {"status": "assigned", "assigned_at": assigned_at, "region": payload["region"]},
        )
        self.activity.create(
            {
                "event_type": "patient_assigned",
                "actor_id": actor_id,
                "equipment_id": payload["equipment_id"],
                "patient_id": payload["patient_id"],
                "assignment_id": assignment["id"],
                "message": "Equipment assigned to patient.",
            }
        )
        return assignment

    def create_return(self, payload: dict[str, Any], actor_id: str) -> dict[str, Any]:
        equipment = self.equipment.get(payload["equipment_id"])
        if equipment["status"] not in {"assigned", "return_in_progress"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Returns can only be initiated for assigned equipment.",
            )

        active_assignment = self.equipment.get_active_assignment(payload["equipment_id"])
        assignment_id = payload.get("assignment_id") or (active_assignment or {}).get("id")
        return_record = self.returns.create({**payload, "assignment_id": assignment_id, "created_by": actor_id})

        self.equipment.update(payload["equipment_id"], {"status": "return_in_progress"})
        if assignment_id:
            self.assignments.update(assignment_id, {"status": "return_in_progress"})

        self.activity.create(
            {
                "event_type": "return_initiated",
                "actor_id": actor_id,
                "equipment_id": payload["equipment_id"],
                "patient_id": payload["patient_id"],
                "assignment_id": assignment_id,
                "return_id": return_record["id"],
                "message": "Return workflow initiated.",
            }
        )
        return return_record

    def update_return_status(
        self,
        return_id: str,
        next_status: str,
        actor_id: str,
        note: str | None = None,
    ) -> dict[str, Any]:
        return_record = self.returns.get(return_id)
        current = return_record["status"]
        if next_status not in RETURN_TRANSITIONS[current]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Return cannot move from {current} to {next_status}.",
            )

        payload: dict[str, Any] = {"status": next_status}
        if note:
            previous_note = return_record.get("notes") or ""
            separator = "\n" if previous_note else ""
            payload["notes"] = f"{previous_note}{separator}[{next_status}] {note}"
        if next_status == "received":
            payload["received_at"] = now_iso()
        if next_status == "closed":
            if not return_record.get("received_at") and current not in {"received", "inspected", "restocked"}:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Return cannot close before the unit has been received.",
                )
            payload["closed_at"] = now_iso()
        if next_status == "restocked":
            inspection = (
                self.client.table("return_inspections")
                .select("*")
                .eq("return_id", return_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            if not inspection or not inspection[0].get("approved_for_restock"):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Return must pass inspection before it can be restocked.",
                )

        updated = self.returns.update(return_id, payload)
        if next_status in {"restocked", "closed"}:
            self.equipment.update(return_record["equipment_id"], {"status": "available", "assigned_at": None})
            if return_record.get("assignment_id"):
                self.assignments.update(
                    return_record["assignment_id"],
                    {"status": "ended", "ended_at": now_iso()},
                )

        self.activity.create(
            {
                "event_type": "return_completed" if next_status == "closed" else "return_status_changed",
                "actor_id": actor_id,
                "equipment_id": return_record["equipment_id"],
                "patient_id": return_record["patient_id"],
                "assignment_id": return_record.get("assignment_id"),
                "return_id": return_id,
                "message": f"Return status changed to {next_status}.",
            }
        )
        return updated

    def update_service_ticket(self, ticket_id: str, payload: dict[str, Any], actor_id: str) -> dict[str, Any]:
        ticket = self.tickets.get(ticket_id)
        next_status = payload.get("status")
        if next_status and next_status != ticket["status"]:
            if next_status not in SERVICE_TRANSITIONS:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"{next_status} is not a valid service ticket status.",
                )
            payload["updated_status_at"] = now_iso()
            if next_status in {"resolved", "closed"}:
                payload["resolved_at"] = ticket.get("resolved_at") or now_iso()
            if next_status == "closed":
                payload["closed_at"] = now_iso()
            elif ticket.get("closed_at"):
                payload["closed_at"] = None

        if payload.get("repair_completed") and not payload.get("repair_notes") and not ticket.get("repair_notes"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Repair notes are required when marking a completed repair.",
            )

        updated = self.tickets.update(ticket_id, payload)
        if payload.get("status") or payload.get("repair_notes"):
            self.client.table("service_ticket_updates").insert(
                {
                    "ticket_id": ticket_id,
                    "status": payload.get("status"),
                    "note": payload.get("repair_notes") or f"Status changed to {payload.get('status')}.",
                    "created_by": actor_id,
                }
            ).execute()
        ticket_changes = build_change_set(ticket, updated, list(payload.keys()))
        if ticket_changes:
            self.activity.create(
                {
                    "event_type": "service_ticket_status_changed",
                    "actor_id": actor_id,
                    "equipment_id": ticket["equipment_id"],
                    "patient_id": ticket.get("patient_id"),
                    "assignment_id": ticket.get("assignment_id"),
                    "service_ticket_id": ticket_id,
                    "message": f"Service ticket status changed to {updated['status']}." if payload.get("status") else "Service ticket updated.",
                    "metadata": {"changes": ticket_changes},
                }
            )
        if updated.get("repair_completed"):
            self.activity.create(
                {
                    "event_type": "repair_completed",
                    "actor_id": actor_id,
                    "equipment_id": ticket["equipment_id"],
                    "patient_id": ticket.get("patient_id"),
                    "assignment_id": ticket.get("assignment_id"),
                    "service_ticket_id": ticket_id,
                    "message": "Repair marked completed.",
                }
            )
        return updated
