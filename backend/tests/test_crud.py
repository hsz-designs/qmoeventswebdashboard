from __future__ import annotations

import unittest
from typing import Any

from fastapi.testclient import TestClient

from backend.crud import CRUD_TABLES
from backend.main import app


BUILDING = {
    "id": 1,
    "created_at": "2026-01-12T17:44:34.752433Z",
    "building_name": "National University Main Building",
    "address": "Sampaloc, Manila",
    "created_by": 1,
    "date_time_last_updated": None,
    "last_updated_by": None,
}


class FakeDatabase:
    def __init__(self) -> None:
        self.calls: list[tuple[Any, ...]] = []

    async def list_records(self, table: str, **options: Any) -> list[dict[str, Any]]:
        self.calls.append(("list", table, options))
        return [BUILDING] if table == "nu_buildings" else []

    async def get_record(self, table: str, record_id: int) -> dict[str, Any]:
        self.calls.append(("get", table, record_id))
        return BUILDING

    async def create_record(
        self, table: str, values: dict[str, Any]
    ) -> dict[str, Any]:
        self.calls.append(("create", table, values))
        return BUILDING

    async def update_record(
        self, table: str, record_id: int, values: dict[str, Any]
    ) -> dict[str, Any]:
        self.calls.append(("update", table, record_id, values))
        return {**BUILDING, **values}

    async def delete_record(self, table: str, record_id: int) -> dict[str, Any]:
        self.calls.append(("delete", table, record_id))
        return BUILDING


class CrudRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()
        self.database = FakeDatabase()
        self.client.app.state.database = self.database

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)

    def test_every_schema_table_has_five_crud_operations(self) -> None:
        openapi_paths = self.client.get("/openapi.json").json()["paths"]

        self.assertEqual(len(CRUD_TABLES), 15)
        for table in CRUD_TABLES:
            collection = openapi_paths[f"/api/{table}"]
            item = openapi_paths[f"/api/{table}/{{record_id}}"]
            self.assertEqual(set(collection), {"get", "post"})
            self.assertEqual(set(item), {"get", "patch", "delete"})

    def test_crud_requests_are_validated_and_forwarded(self) -> None:
        list_response = self.client.get(
            "/api/nu_buildings?limit=10&offset=5&order_by=building_name"
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.json()[0]["id"], 1)

        self.assertEqual(self.client.get("/api/nu_buildings/1").status_code, 200)

        create_response = self.client.post(
            "/api/nu_buildings",
            json={"building_name": "National University Main Building"},
        )
        self.assertEqual(create_response.status_code, 201)

        update_response = self.client.patch(
            "/api/nu_buildings/1", json={"address": "Sampaloc, Manila"}
        )
        self.assertEqual(update_response.status_code, 200)

        self.assertEqual(self.client.delete("/api/nu_buildings/1").status_code, 200)
        self.assertEqual(
            [call[0] for call in self.database.calls],
            ["list", "get", "create", "update", "delete"],
        )

    def test_invalid_list_and_empty_update_are_rejected(self) -> None:
        invalid_order = self.client.get("/api/nu_buildings?order_by=not_a_column")
        self.assertEqual(invalid_order.status_code, 422)

        empty_update = self.client.patch("/api/nu_buildings/1", json={})
        self.assertEqual(empty_update.status_code, 422)


if __name__ == "__main__":
    unittest.main()
