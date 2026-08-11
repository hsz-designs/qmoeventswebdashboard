"""Small async client for the Supabase/PostgREST database API."""

from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import HTTPException, Request, status


class SupabaseRestClient:
    """Perform table CRUD through Supabase's generated REST API."""

    def __init__(self, supabase_url: str, api_key: str) -> None:
        self._client = httpx.AsyncClient(
            base_url=f"{supabase_url.rstrip('/')}/rest/v1",
            headers={
                "Accept": "application/json",
                "Accept-Profile": "public",
                "Content-Profile": "public",
                "apikey": api_key,
                "Authorization": f"Bearer {api_key}",
            },
            timeout=httpx.Timeout(15.0),
        )

    @classmethod
    def from_environment(cls) -> SupabaseRestClient | None:
        supabase_url = os.getenv("SUPABASE_URL") or os.getenv(
            "NEXT_PUBLIC_SUPABASE_URL"
        )
        api_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv(
            "SUPABASE_ANON_KEY"
        )

        if not supabase_url or not api_key:
            return None

        return cls(supabase_url=supabase_url, api_key=api_key)

    async def close(self) -> None:
        await self._client.aclose()

    async def list_records(
        self,
        table: str,
        *,
        limit: int,
        offset: int,
        order_by: str,
        order_direction: str,
    ) -> list[dict[str, Any]]:
        payload = await self._request(
            "GET",
            table,
            params={
                "select": "*",
                "limit": str(limit),
                "offset": str(offset),
                "order": f"{order_by}.{order_direction}",
            },
        )
        return self._as_record_list(payload)

    async def get_record(self, table: str, record_id: int) -> dict[str, Any]:
        payload = await self._request(
            "GET",
            table,
            params={"select": "*", "id": f"eq.{record_id}", "limit": "1"},
        )
        return self._one_record(table, record_id, payload)

    async def create_record(
        self, table: str, values: dict[str, Any]
    ) -> dict[str, Any]:
        payload = await self._request(
            "POST",
            table,
            json=values,
            headers={"Prefer": "return=representation"},
        )
        records = self._as_record_list(payload)
        if not records:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"{table} did not return the created record",
            )
        return records[0]

    async def update_record(
        self, table: str, record_id: int, values: dict[str, Any]
    ) -> dict[str, Any]:
        payload = await self._request(
            "PATCH",
            table,
            params={"id": f"eq.{record_id}"},
            json=values,
            headers={"Prefer": "return=representation"},
        )
        return self._one_record(table, record_id, payload)

    async def delete_record(self, table: str, record_id: int) -> dict[str, Any]:
        payload = await self._request(
            "DELETE",
            table,
            params={"id": f"eq.{record_id}"},
            headers={"Prefer": "return=representation"},
        )
        return self._one_record(table, record_id, payload)

    async def _request(
        self,
        method: str,
        table: str,
        *,
        params: dict[str, str] | None = None,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        try:
            response = await self._client.request(
                method,
                f"/{table}",
                params=params,
                json=json,
                headers=headers,
            )
        except httpx.RequestError as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The database service is unavailable",
            ) from error

        if response.is_error:
            try:
                error_payload = response.json()
            except ValueError:
                error_payload = response.text

            if isinstance(error_payload, dict):
                detail = error_payload.get("message") or error_payload.get("hint")
                detail = detail or "The database rejected the request"
            else:
                detail = error_payload or "The database rejected the request"

            raise HTTPException(status_code=response.status_code, detail=detail)

        if response.status_code == status.HTTP_204_NO_CONTENT or not response.content:
            return []

        return response.json()

    @staticmethod
    def _as_record_list(payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return [record for record in payload if isinstance(record, dict)]
        if isinstance(payload, dict):
            return [payload]
        return []

    def _one_record(self, table: str, record_id: int, payload: Any) -> dict[str, Any]:
        records = self._as_record_list(payload)
        if not records:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No {table} record exists with id {record_id}",
            )
        return records[0]


def get_database(request: Request) -> SupabaseRestClient:
    database = getattr(request.app.state, "database", None)
    if database is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Database credentials are not configured. Set SUPABASE_URL and "
                "SUPABASE_SERVICE_ROLE_KEY in backend/.env."
            ),
        )
    return database
