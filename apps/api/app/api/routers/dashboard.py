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


@router.get("/utilization")
def dashboard_utilization(_: Annotated[AuthUser, Depends(get_current_user)]) -> dict[str, Any]:
    client = get_supabase()
    equipment = (
        client.table("equipment")
        .select("id,serial_number,make,model,status,region,equipment_type,added_at,updated_at,assigned_at")
        .is_("archived_at", "null")
        .execute()
        .data
        or []
    )
    tickets = client.table("service_tickets").select("id,equipment_id,status,repair_completed,opened_at").execute().data or []
    active_fleet = [item for item in equipment if item["status"] != "retired"]
    assigned = [item for item in active_fleet if item["status"] == "assigned"]
    available = [item for item in active_fleet if item["status"] == "available"]
    in_repair = [item for item in active_fleet if item["status"] == "in_repair"]
    active_returns = [item for item in active_fleet if item["status"] == "return_in_progress"]
    now = datetime.now(timezone.utc)

    def parse_date(value: str | None) -> datetime:
        if not value:
            return now
        return datetime.fromisoformat(value.replace("Z", "+00:00"))

    idle_candidates = []
    for item in available:
        idle_since = parse_date(item.get("updated_at") or item.get("added_at"))
        idle_days = max(0, (now - idle_since).days)
        idle_candidates.append(
            {
                "id": item["id"],
                "serial_number": item["serial_number"],
                "make": item["make"],
                "model": item["model"],
                "region": item["region"],
                "equipment_type": item["equipment_type"],
                "idle_days": idle_days,
            }
        )

    by_region_type: dict[tuple[str, str], dict[str, Any]] = {}
    for item in active_fleet:
        key = (item["region"], item["equipment_type"])
        row = by_region_type.setdefault(
            key,
            {
                "region": item["region"],
                "equipment_type": item["equipment_type"],
                "total": 0,
                "assigned": 0,
                "available": 0,
                "in_repair": 0,
                "return_in_progress": 0,
                "utilization_rate": 0.0,
            },
        )
        row["total"] += 1
        if item["status"] in row:
            row[item["status"]] += 1

    for row in by_region_type.values():
        row["utilization_rate"] = round((row["assigned"] / row["total"]) * 100, 1) if row["total"] else 0

    open_ticket_equipment_ids = {ticket["equipment_id"] for ticket in tickets if ticket["status"] not in {"closed", "cancelled"}}
    return {
        "active_fleet": len(active_fleet),
        "assigned": len(assigned),
        "available": len(available),
        "in_repair": len(in_repair),
        "active_returns": len(active_returns),
        "utilization_rate": round((len(assigned) / len(active_fleet)) * 100, 1) if active_fleet else 0,
        "repair_drag_rate": round((len(in_repair) / len(active_fleet)) * 100, 1) if active_fleet else 0,
        "return_drag_rate": round((len(active_returns) / len(active_fleet)) * 100, 1) if active_fleet else 0,
        "open_ticket_equipment": len(open_ticket_equipment_ids),
        "idle_over_30_days": len([item for item in idle_candidates if item["idle_days"] >= 30]),
        "top_idle": sorted(idle_candidates, key=lambda item: item["idle_days"], reverse=True)[:8],
        "by_region_type": sorted(by_region_type.values(), key=lambda item: (item["region"], item["equipment_type"])),
    }


@router.get("/data-quality")
def data_quality(_: Annotated[AuthUser, Depends(get_current_user)]) -> dict[str, Any]:
    client = get_supabase()
    equipment = (
        client.table("equipment")
        .select("id,serial_number,make,model,status,region,equipment_type,bought_price,assigned_at")
        .is_("archived_at", "null")
        .limit(1000)
        .execute()
        .data
        or []
    )
    assignments = (
        client.table("assignments")
        .select("id,equipment_id,patient_id,status,assigned_at,region,equipment(serial_number,make,model,status),patients(full_name)")
        .limit(1000)
        .execute()
        .data
        or []
    )
    returns = (
        client.table("returns")
        .select("id,equipment_id,patient_id,status,requested_at,equipment(serial_number,make,model,status,region),patients(full_name)")
        .limit(1000)
        .execute()
        .data
        or []
    )
    tickets = (
        client.table("service_tickets")
        .select("id,ticket_number,equipment_id,status,repair_completed,equipment(serial_number,make,model,status)")
        .limit(1000)
        .execute()
        .data
        or []
    )

    issues: list[dict[str, Any]] = []
    active_assignments = [item for item in assignments if item["status"] in {"active", "return_in_progress"}]
    active_assignment_equipment = {item["equipment_id"] for item in active_assignments}
    active_returns = [item for item in returns if item["status"] not in {"closed", "cancelled", "restocked"}]
    active_return_equipment = {item["equipment_id"] for item in active_returns}

    for item in equipment:
        label = f"{item['serial_number']} - {item['make']} {item['model']}"
        if float(item.get("bought_price") or 0) <= 0:
            issues.append(_quality_issue("missing_cost", "warning", "Equipment has no purchase cost", label, item["region"], f"/equipment/{item['id']}"))
        if item["status"] == "assigned" and item["id"] not in active_assignment_equipment:
            issues.append(_quality_issue("assignment_mismatch", "critical", "Equipment marked assigned without active assignment", label, item["region"], f"/equipment/{item['id']}"))
        if item["status"] == "return_in_progress" and item["id"] not in active_return_equipment:
            issues.append(_quality_issue("return_mismatch", "critical", "Equipment marked in return without active return workflow", label, item["region"], f"/equipment/{item['id']}"))

    for assignment in active_assignments:
        equipment_record = assignment.get("equipment") or {}
        if equipment_record.get("status") not in {"assigned", "return_in_progress"}:
            issues.append(
                _quality_issue(
                    "assignment_mismatch",
                    "warning",
                    "Active assignment equipment status does not match",
                    f"{_equipment_label(assignment)} assigned to {assignment.get('patients', {}).get('full_name') if assignment.get('patients') else 'patient'}",
                    assignment["region"],
                    "/assigned",
                )
            )

    for record in active_returns:
        equipment_record = record.get("equipment") or {}
        if equipment_record.get("status") not in {"return_in_progress", "assigned"}:
            issues.append(
                _quality_issue(
                    "return_mismatch",
                    "warning",
                    "Active return equipment status looks inconsistent",
                    f"{_equipment_label(record)} / return status {record['status']}",
                    equipment_record.get("region"),
                    "/returns",
                )
            )

    for ticket in tickets:
        if ticket["status"] in {"resolved", "closed"} and ticket.get("repair_completed") and (ticket.get("equipment") or {}).get("status") == "in_repair":
            issues.append(
                _quality_issue(
                    "repair_mismatch",
                    "warning",
                    "Repair completed but equipment is still marked in repair",
                    _equipment_label(ticket),
                    None,
                    f"/service-tickets/{ticket['id']}",
                )
            )

    return {
        "issues": issues,
        "counts": {
            "total": len(issues),
            "critical": len([item for item in issues if item["severity"] == "critical"]),
            "warning": len([item for item in issues if item["severity"] == "warning"]),
            "info": len([item for item in issues if item["severity"] == "info"]),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _quality_issue(kind: str, severity: str, title: str, detail: str, region: str | None, href: str) -> dict[str, Any]:
    return {
        "id": f"{kind}:{href}:{detail}",
        "kind": kind,
        "severity": severity,
        "title": title,
        "detail": detail,
        "region": region,
        "href": href,
    }


def _equipment_label(record: dict[str, Any]) -> str:
    equipment = record.get("equipment")
    if not equipment:
        return f"equipment {record.get('equipment_id', '')}"
    return f"{equipment['serial_number']} - {equipment['make']} {equipment['model']}"
