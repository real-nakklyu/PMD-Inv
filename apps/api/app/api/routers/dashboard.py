from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.core.auth import AuthUser, get_current_user
from app.db.supabase import get_supabase

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def count_where(table: str, **filters: str) -> int:
    query = get_supabase().table(table).select("id", count="exact")
    for key, value in filters.items():
        query = query.eq(key, value)
    response = query.execute()
    return response.count or 0


@router.get("/summary")
def dashboard_summary(_: Annotated[AuthUser, Depends(get_current_user)]) -> dict[str, Any]:
    client = get_supabase()
    equipment = client.table("equipment").select("id,status,region,equipment_type").is_("archived_at", "null").execute().data or []
    tickets = client.table("service_tickets").select("id,status,repair_completed,opened_at").execute().data or []
    returns = client.table("returns").select("id,status,requested_at").execute().data or []
    activity = client.table("activity_logs").select("*").order("created_at", desc=True).limit(12).execute().data or []

    by_region: dict[str, int] = {}
    by_type: dict[str, int] = {}
    by_status: dict[str, int] = {}
    available_by_region_type: dict[tuple[str, str], int] = {}
    for item in equipment:
        by_region[item["region"]] = by_region.get(item["region"], 0) + 1
        by_type[item["equipment_type"]] = by_type.get(item["equipment_type"], 0) + 1
        by_status[item["status"]] = by_status.get(item["status"], 0) + 1
        if item["status"] == "available":
            key = (item["region"], item["equipment_type"])
            available_by_region_type[key] = available_by_region_type.get(key, 0) + 1

    overdue_cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    overdue_returns = [
        record
        for record in returns
        if record["status"] not in {"received", "inspected", "restocked", "closed", "cancelled"}
        and datetime.fromisoformat(record["requested_at"].replace("Z", "+00:00")) < overdue_cutoff
    ]
    zero_available = []
    for region in {
        "Miami",
        "Fort Myers",
        "Sarasota",
        "Tampa",
        "Orlando",
        "Gainesville",
        "Jacksonville",
        "Tallahassee",
        "Destin",
    }:
        for equipment_type in {"power_wheelchair", "scooter"}:
            if available_by_region_type.get((region, equipment_type), 0) == 0:
                zero_available.append({"region": region, "type": equipment_type})

    return {
        "total_equipment": len(equipment),
        "available": by_status.get("available", 0),
        "assigned": by_status.get("assigned", 0),
        "in_returns_process": by_status.get("return_in_progress", 0),
        "in_repair": by_status.get("in_repair", 0),
        "retired": by_status.get("retired", 0),
        "open_service_tickets": len([t for t in tickets if t["status"] not in {"closed", "cancelled"}]),
        "active_returns": len([r for r in returns if r["status"] not in {"closed", "cancelled"}]),
        "overdue_returns": len(overdue_returns),
        "completed_repairs": len([t for t in tickets if t.get("repair_completed")]),
        "tickets_opened_this_month": len(
            [
                ticket
                for ticket in tickets
                if datetime.fromisoformat(ticket["opened_at"].replace("Z", "+00:00")).month
                == datetime.now(timezone.utc).month
            ]
        ),
        "equipment_by_region": [{"region": key, "count": value} for key, value in by_region.items()],
        "equipment_by_type": [{"type": key, "count": value} for key, value in by_type.items()],
        "zero_available": zero_available[:12],
        "recent_activity": activity,
    }
