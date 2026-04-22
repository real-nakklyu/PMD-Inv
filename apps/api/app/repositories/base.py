from typing import Any

from fastapi import HTTPException, status

from app.db.supabase import SupabaseRestClient


class SupabaseRepository:
    table_name: str

    def __init__(self, client: SupabaseRestClient):
        self.client = client

    @property
    def table(self):
        return self.client.table(self.table_name)

    def list(self, *, limit: int = 50, offset: int = 0, order: str = "created_at") -> list[dict[str, Any]]:
        response = self.table.select("*").order(order, desc=True).range(offset, offset + limit - 1).execute()
        return response.data or []

    def get(self, item_id: str) -> dict[str, Any]:
        response = self.table.select("*").eq("id", item_id).single().execute()
        if not response.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found.")
        return response.data

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.table.insert(payload).execute()
        return response.data[0]

    def update(self, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.table.update(payload).eq("id", item_id).execute()
        if not response.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found.")
        return response.data[0]

    def delete(self, item_id: str) -> None:
        self.get(item_id)
        self.table.delete().eq("id", item_id).execute()
