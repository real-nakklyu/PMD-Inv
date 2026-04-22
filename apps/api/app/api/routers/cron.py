from datetime import UTC, datetime
from secrets import compare_digest
from typing import Annotated, Any

from fastapi import APIRouter, Header, HTTPException, status

from app.core.settings import get_settings
from app.db.supabase import get_supabase

router = APIRouter(prefix="/cron", tags=["cron"])

COMPLETED_RETURN_STATUSES = {"received", "inspected", "restocked", "closed", "cancelled"}


@router.get("/overdue-returns")
def overdue_return_reminders(authorization: Annotated[str | None, Header()] = None) -> dict[str, Any]:
    settings = get_settings()
    expected = f"Bearer {settings.cron_secret}" if settings.cron_secret else None
    if not expected or not authorization or not compare_digest(authorization, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized cron request.")

    supabase = get_supabase()
    response = supabase.table("returns").select("id,equipment_id,patient_id,status,requested_at").execute()
    now = datetime.now(UTC)
    overdue: list[dict[str, Any]] = []

    for item in response.data or []:
        requested_at = datetime.fromisoformat(str(item["requested_at"]).replace("Z", "+00:00"))
        age_days = (now - requested_at).days
        if item["status"] not in COMPLETED_RETURN_STATUSES and age_days > 7:
            overdue.append({**item, "overdue_days": age_days})

    if not overdue:
        return {"ok": True, "overdue_count": 0, "logged_count": 0}

    logs = [
        {
            "event_type": "return_status_changed",
            "equipment_id": item["equipment_id"],
            "patient_id": item["patient_id"],
            "return_id": item["id"],
            "message": f"Overdue return reminder: return {item['id']} has been open for {item['overdue_days']} days.",
            "metadata": {
                "source": "vercel_cron",
                "status": item["status"],
                "overdue_days": item["overdue_days"],
            },
        }
        for item in overdue
    ]
    supabase.table("activity_logs").insert(logs).execute()

    return {"ok": True, "overdue_count": len(overdue), "logged_count": len(logs)}
