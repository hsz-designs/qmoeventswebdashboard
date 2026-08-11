"""Typed CRUD endpoints generated from the NU table row schemas."""

from dataclasses import dataclass
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, create_model

from backend.database import get_database
from backend.schemas import CSV_ROW_MODELS, CsvRowModel


class CrudResource(BaseModel):
    table: str
    collection_path: str
    item_path: str
    fields: list[str]


@dataclass(frozen=True)
class CrudTable:
    table: str
    row_model: type[CsvRowModel]
    create_model: type[CsvRowModel]
    update_model: type[CsvRowModel]
    database_fields: frozenset[str]


def _payload_model(
    row_model: type[CsvRowModel], suffix: str, *, update: bool
) -> type[CsvRowModel]:
    field_definitions: dict[str, Any] = {}

    for field_name, model_field in row_model.model_fields.items():
        if update and field_name == "id":
            continue

        annotation = model_field.annotation
        is_generated_create_field = not update and field_name in {"id", "created_at"}

        if update or is_generated_create_field:
            annotation = annotation | None
            default: Any = None
        else:
            default = ... if model_field.is_required() else model_field.default

        if model_field.alias:
            field_definitions[field_name] = (
                annotation,
                Field(default=default, alias=model_field.alias),
            )
        else:
            field_definitions[field_name] = (annotation, default)

    return create_model(
        f"{row_model.__name__.removesuffix('Row')}{suffix}",
        __base__=CsvRowModel,
        **field_definitions,
    )


def _table_name(filename: str) -> str:
    return filename.removesuffix("_rows.csv")


CRUD_TABLES: dict[str, CrudTable] = {}
for csv_filename, row_schema in CSV_ROW_MODELS.items():
    table_name = _table_name(csv_filename)
    database_fields = frozenset(
        model_field.alias or field_name
        for field_name, model_field in row_schema.model_fields.items()
    )
    CRUD_TABLES[table_name] = CrudTable(
        table=table_name,
        row_model=row_schema,
        create_model=_payload_model(row_schema, "Create", update=False),
        update_model=_payload_model(row_schema, "Update", update=True),
        database_fields=database_fields,
    )


router = APIRouter(prefix="/api")


@router.get("", response_model=list[CrudResource], tags=["CRUD resources"])
async def list_crud_resources() -> list[CrudResource]:
    return [
        CrudResource(
            table=configuration.table,
            collection_path=f"/api/{configuration.table}",
            item_path=f"/api/{configuration.table}/{{record_id}}",
            fields=sorted(configuration.database_fields),
        )
        for configuration in CRUD_TABLES.values()
    ]


def _register_crud_routes(configuration: CrudTable) -> None:
    collection_path = f"/{configuration.table}"
    item_path = f"/{configuration.table}/{{record_id}}"
    response_list_model = list[configuration.row_model]

    async def list_records(
        request: Request,
        limit: int = Query(default=50, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
        order_by: str = Query(default="id"),
        order_direction: Literal["asc", "desc"] = Query(default="asc"),
    ) -> list[dict[str, Any]]:
        if order_by not in configuration.database_fields:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"order_by must be a field on {configuration.table}",
            )

        database = get_database(request)
        return await database.list_records(
            configuration.table,
            limit=limit,
            offset=offset,
            order_by=order_by,
            order_direction=order_direction,
        )

    async def get_record(request: Request, record_id: int) -> dict[str, Any]:
        database = get_database(request)
        return await database.get_record(configuration.table, record_id)

    async def create_record(request: Request, payload: BaseModel) -> dict[str, Any]:
        database = get_database(request)
        values = payload.model_dump(mode="json", by_alias=True, exclude_unset=True)
        if values.get("id") is None:
            values.pop("id", None)
        return await database.create_record(configuration.table, values)

    async def update_record(
        request: Request, record_id: int, payload: BaseModel
    ) -> dict[str, Any]:
        values = payload.model_dump(mode="json", by_alias=True, exclude_unset=True)
        if not values:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Provide at least one field to update",
            )

        database = get_database(request)
        return await database.update_record(configuration.table, record_id, values)

    async def delete_record(request: Request, record_id: int) -> dict[str, Any]:
        database = get_database(request)
        return await database.delete_record(configuration.table, record_id)

    create_record.__annotations__["payload"] = configuration.create_model
    update_record.__annotations__["payload"] = configuration.update_model

    table_tag = configuration.table
    router.add_api_route(
        collection_path,
        list_records,
        methods=["GET"],
        response_model=response_list_model,
        tags=[table_tag],
        name=f"List {table_tag}",
        operation_id=f"list_{table_tag}",
    )
    router.add_api_route(
        item_path,
        get_record,
        methods=["GET"],
        response_model=configuration.row_model,
        tags=[table_tag],
        name=f"Get {table_tag}",
        operation_id=f"get_{table_tag}",
    )
    router.add_api_route(
        collection_path,
        create_record,
        methods=["POST"],
        response_model=configuration.row_model,
        status_code=status.HTTP_201_CREATED,
        tags=[table_tag],
        name=f"Create {table_tag}",
        operation_id=f"create_{table_tag}",
    )
    router.add_api_route(
        item_path,
        update_record,
        methods=["PATCH"],
        response_model=configuration.row_model,
        tags=[table_tag],
        name=f"Update {table_tag}",
        operation_id=f"update_{table_tag}",
    )
    router.add_api_route(
        item_path,
        delete_record,
        methods=["DELETE"],
        response_model=configuration.row_model,
        tags=[table_tag],
        name=f"Delete {table_tag}",
        operation_id=f"delete_{table_tag}",
    )


for crud_table in CRUD_TABLES.values():
    _register_crud_routes(crud_table)
