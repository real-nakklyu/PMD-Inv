from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException, status

from app.core.settings import get_settings


@dataclass
class QueryResult:
    data: Any
    count: int | None = None


class PostgrestQuery:
    def __init__(self, client: SupabaseRestClient, table_name: str):
        self.client = client
        self.table_name = table_name
        self.method = "GET"
        self.payload: dict[str, Any] | list[dict[str, Any]] | None = None
        self.params: dict[str, str] = {}
        self.headers: dict[str, str] = {}
        self.expect_single = False
        self.head = False

    def select(self, columns: str = "*", *, count: str | None = None, head: bool = False) -> PostgrestQuery:
        self.method = "HEAD" if head else "GET"
        self.head = head
        self.params["select"] = columns
        if count:
            self.headers["Prefer"] = f"count={count}"
        return self

    def insert(self, payload: dict[str, Any] | list[dict[str, Any]]) -> PostgrestQuery:
        self.method = "POST"
        self.payload = payload
        self.headers["Prefer"] = "return=representation"
        return self

    def update(self, payload: dict[str, Any]) -> PostgrestQuery:
        self.method = "PATCH"
        self.payload = payload
        self.headers["Prefer"] = "return=representation"
        return self

    def delete(self) -> PostgrestQuery:
        self.method = "DELETE"
        return self

    def eq(self, column: str, value: Any) -> PostgrestQuery:
        self.params[column] = f"eq.{value}"
        return self

    def neq(self, column: str, value: Any) -> PostgrestQuery:
        self.params[column] = f"neq.{value}"
        return self

    def ilike(self, column: str, value: str) -> PostgrestQuery:
        self.params[column] = f"ilike.{value}"
        return self

    def is_(self, column: str, value: str) -> PostgrestQuery:
        self.params[column] = f"is.{value}"
        return self

    def in_(self, column: str, values: list[str]) -> PostgrestQuery:
        joined = ",".join(values)
        self.params[column] = f"in.({joined})"
        return self

    def or_(self, expression: str) -> PostgrestQuery:
        self.params["or"] = f"({expression})"
        return self

    def order(self, column: str, *, desc: bool = False) -> PostgrestQuery:
        self.params["order"] = f"{column}.{'desc' if desc else 'asc'}"
        return self

    def range(self, start: int, end: int) -> PostgrestQuery:
        self.headers["Range-Unit"] = "items"
        self.headers["Range"] = f"{start}-{end}"
        return self

    def limit(self, value: int) -> PostgrestQuery:
        self.params["limit"] = str(value)
        return self

    def single(self) -> PostgrestQuery:
        self.expect_single = True
        self.headers["Accept"] = "application/vnd.pgrst.object+json"
        return self

    def execute(self) -> QueryResult:
        return self.client.execute_query(self)


class SupabaseRestClient:
    def __init__(self, supabase_url: str, service_role_key: str):
        self.rest_url = f"{supabase_url.rstrip('/')}/rest/v1"
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }

    def table(self, table_name: str) -> PostgrestQuery:
        return PostgrestQuery(self, table_name)

    def execute_query(self, query: PostgrestQuery) -> QueryResult:
        url = f"{self.rest_url}/{quote(query.table_name)}"
        headers = {**self.headers, **query.headers}
        with httpx.Client(timeout=20) as client:
            response = client.request(
                query.method,
                url,
                params=query.params,
                headers=headers,
                json=query.payload,
            )

        if response.status_code >= 400:
            detail = response.text
            try:
                detail = response.json().get("message", detail)
            except ValueError:
                pass
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

        count = None
        content_range = response.headers.get("content-range")
        if content_range and "/" in content_range:
            total = content_range.rsplit("/", 1)[1]
            count = int(total) if total.isdigit() else None

        if query.head or response.status_code == 204 or not response.content:
            return QueryResult(data=[] if not query.expect_single else None, count=count)

        data = response.json()
        return QueryResult(data=data, count=count)


@lru_cache
def get_supabase() -> SupabaseRestClient:
    settings = get_settings()
    return SupabaseRestClient(settings.supabase_url, settings.supabase_service_role_key)
