from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi import status as http_status

from app.core.auth import AuthUser, get_current_user, require_roles
from app.db.supabase import get_supabase
from app.repositories.simple import ServiceTicketRepository
from app.schemas.workflows import ServiceTicketCreate, ServiceTicketOut, ServiceTicketUpdate
from app.services.workflows import WorkflowService, now_iso

router = APIRouter(prefix="/service-tickets", tags=["service tickets"])


@router.get("")
def list_service_tickets(_: Annotated[AuthUser, Depends(get_current_user)], limit: int = 50, offset: int = 0):
    repo = ServiceTicketRepository(get_supabase())
    response = (
        repo.table.select("*, patients(full_name,date_of_birth,region), equipment(serial_number,make,model,equipment_type,status)")
        .order("opened_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return response.data or []


@router.get("/{ticket_id}")
def get_service_ticket(ticket_id: str, _: Annotated[AuthUser, Depends(get_current_user)]):
    response = (
        get_supabase()
        .table("service_tickets")
        .select("*, patients(full_name,date_of_birth,region), equipment(serial_number,make,model,equipment_type,status), service_ticket_updates(*)")
        .eq("id", ticket_id)
        .single()
        .execute()
    )
    return response.data


@router.post("", response_model=ServiceTicketOut, status_code=201)
def create_service_ticket(
    payload: ServiceTicketCreate,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher", "technician"))],
):
    data = payload.model_dump(mode="json")
    ticket = ServiceTicketRepository(get_supabase()).create({**data, "created_by": user.id})
    get_supabase().table("activity_logs").insert(
        {
            "event_type": "service_ticket_created",
            "actor_id": user.id,
            "equipment_id": ticket["equipment_id"],
            "patient_id": ticket.get("patient_id"),
            "assignment_id": ticket.get("assignment_id"),
            "service_ticket_id": ticket["id"],
            "message": "Service ticket created.",
        }
    ).execute()
    return ticket


@router.patch("/{ticket_id}", response_model=ServiceTicketOut)
def update_service_ticket(
    ticket_id: str,
    payload: ServiceTicketUpdate,
    user: Annotated[AuthUser, Depends(require_roles("admin", "dispatcher", "technician"))],
):
    data = payload.model_dump(mode="json", exclude_unset=True)
    if data.get("status"):
        data["updated_status_at"] = now_iso()
    return WorkflowService(get_supabase()).update_service_ticket(ticket_id, data, actor_id=user.id)


@router.delete("/{ticket_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_service_ticket(ticket_id: str, _: Annotated[AuthUser, Depends(require_roles("admin"))]):
    client = get_supabase()
    client.table("service_ticket_updates").delete().eq("ticket_id", ticket_id).execute()
    client.table("activity_logs").delete().eq("service_ticket_id", ticket_id).execute()
    ServiceTicketRepository(client).delete(ticket_id)
