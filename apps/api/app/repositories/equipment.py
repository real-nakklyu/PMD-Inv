from typing import Any

from fastapi import HTTPException, status

from app.db.supabase import SupabaseRestClient
from app.repositories.base import SupabaseRepository


class EquipmentRepository(SupabaseRepository):
    table_name = "equipment"

    def __init__(self, client: SupabaseRestClient):
        super().__init__(client)

    def list_filtered(
        self,
        *,
        search: str | None = None,
        status_value: str | None = None,
        region: str | None = None,
        equipment_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        query = self.table.select("*").is_("archived_at", "null")
        if status_value:
            query = query.eq("status", status_value)
        if region:
            query = query.eq("region", region)
        if equipment_type:
            query = query.eq("equipment_type", equipment_type)
        if search:
            pattern = f"%{search}%"
            query = query.or_(f"serial_number.ilike.{pattern},make.ilike.{pattern},model.ilike.{pattern}")
        response = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
        return response.data or []

    def list_filtered_page(
        self,
        *,
        search: str | None = None,
        status_value: str | None = None,
        region: str | None = None,
        equipment_type: str | None = None,
        limit: int = 25,
        offset: int = 0,
    ) -> dict[str, Any]:
        query = self.table.select("*", count="exact").is_("archived_at", "null")
        if status_value:
            query = query.eq("status", status_value)
        if region:
            query = query.eq("region", region)
        if equipment_type:
            query = query.eq("equipment_type", equipment_type)
        if search:
            pattern = f"%{search}%"
            query = query.or_(f"serial_number.ilike.{pattern},make.ilike.{pattern},model.ilike.{pattern}")
        response = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
        return {"items": response.data or [], "total": response.count or 0, "limit": limit, "offset": offset}

    def ensure_serial_available(self, serial_number: str, *, exclude_id: str | None = None) -> None:
        query = self.table.select("id").ilike("serial_number", serial_number).is_("archived_at", "null")
        if exclude_id:
            query = query.neq("id", exclude_id)
        response = query.limit(1).execute()
        if response.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An equipment record with this serial number already exists.",
            )

    def get_active_assignment(self, equipment_id: str) -> dict[str, Any] | None:
        response = (
            self.client.table("assignments")
            .select("*")
            .eq("equipment_id", equipment_id)
            .in_("status", ["active", "return_in_progress"])
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else None
