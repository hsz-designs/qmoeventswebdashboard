"""Pydantic representations of the NU CSV rows.

The Python attributes use snake_case. CSV-only names such as ``userID`` and
``bio note`` are retained as validation aliases so rows from ``csv.DictReader``
can be validated directly.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CsvRowModel(BaseModel):
    """Base behavior shared by every exported CSV row."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def convert_blank_cells_to_none(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        normalized: dict[str, Any] = {}
        for key, cell in value.items():
            if not isinstance(cell, str):
                normalized[key] = cell
                continue

            stripped_cell = cell.strip()
            if not stripped_cell:
                normalized[key] = None
                continue

            # PostgreSQL emits UTC offsets such as "+00" in these exports.
            # ISO/Pydantic parsers expect the equivalent "+00:00" form.
            if re.match(r"^\d{4}-\d{2}-\d{2}[ T]", stripped_cell) and re.search(
                r"[+-]\d{2}$", stripped_cell
            ):
                stripped_cell += ":00"

            normalized[key] = stripped_cell

        return normalized


class NuBuildingRow(CsvRowModel):
    id: int
    created_at: datetime
    building_name: str
    address: str | None = None
    created_by: int | None = None
    date_time_last_updated: datetime | None = None
    last_updated_by: int | None = None


class NuDepartmentRow(CsvRowModel):
    id: int
    created_at: datetime
    department_name: str
    created_by: int | None = None
    last_updated_date_time: datetime | None = None
    last_updated_by: int | None = None


class NuEventAttendeeLogRow(CsvRowModel):
    id: int
    created_at: datetime
    event_id: int
    user_id: UUID | None = None
    date_time: datetime
    date_index: int | None = None
    session_id: int
    log_type: int


class NuEventAttendeeRow(CsvRowModel):
    id: int
    created_at: datetime
    user_id: UUID | None = None
    event_id: int
    date_time_first_in: datetime | None = None
    date_time_last_out: datetime | None = None
    date_index: int | None = None
    status: int = 0
    session_id: int
    certificate_url: str | None = None


class NuEventQuestionRow(CsvRowModel):
    id: int
    created_at: datetime
    event_id: int
    date_index: int
    question: str
    user_id: UUID
    status: int = 0
    reply_by_speaker_handler: str | None = None
    speaker_id: str | None = None


class NuEventSessionRow(CsvRowModel):
    id: int
    created_at: datetime
    session_topic: str
    session_speaker_id: str | None = None
    session_date: date
    session_start_time: time
    session_end_time: time
    session_building_id: int
    session_floor_id: int
    session_room_id: int
    session_event_id: int
    session_type: Literal[1, 2] = 1
    session_max_capacity: int | None = None
    status: Literal[0, 1] = 1


class NuEventRow(CsvRowModel):
    id: int
    created_at: datetime
    event_name: str
    created_by: int | None = None
    event_description: str
    event_theme: str | None = None
    schedule_id: int | None = None
    theme_colors: str | None = None
    qrcode_value: str | None = None
    event_head_organizer_id: int | None = None
    event_topics: str | None = None
    event_host_user_id: int | None = None
    start_datetime: datetime
    end_datetime: datetime
    place_id: int | None = None
    status: str = "draft"


class NuCertificateTemplateRow(CsvRowModel):
    id: UUID
    event_id: int | None = None
    type: str
    name: str
    asset_path: str
    config: dict[str, Any] | None = None
    is_active: bool = True
    created_at: datetime


class NuCertificateRow(CsvRowModel):
    id: UUID
    event_id: int
    type: str
    status: str = "pending"
    recipient_name: str
    recipient_email: str
    verification_code: str
    issued_at: datetime | None = None
    revoked_at: datetime | None = None
    file_path: str | None = None
    created_at: datetime


class NuCertificateAuditRow(CsvRowModel):
    id: UUID
    certificate_id: UUID
    action: str
    actor_user_id: UUID | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime


class NuFloorRow(CsvRowModel):
    id: int
    created_at: datetime
    building_id: int
    created_by: int | None = None
    date_time_last_updated: datetime | None = None
    last_updated_by: int | None = None
    floor_name: str


class NuPlaceRow(CsvRowModel):
    id: int
    created_at: datetime
    place_name: str
    room_id: int
    created_by: int | None = None
    last_updated_by: int | None = None
    date_time_last_updated: datetime | None = None
    direction: str | None = None
    department_id: int | None = None


class NuRoomRow(CsvRowModel):
    id: int
    created_at: datetime
    room_no: str
    building_id: int
    floor_id: int
    created_by: int | None = None
    last_updated_by: int | None = None
    date_time_last_updated: datetime | None = None
    room_max_capacity: int | None = None


class NuUserNoteRow(CsvRowModel):
    id: int
    created_at: datetime
    user_id: UUID
    note_content: str
    for_event_id: int
    date_index: int
    session_id: int | None = None


class NuUserRow(CsvRowModel):
    id: int
    created_at: datetime | None = None
    username: str | None = None
    email: str
    role: int = 0
    firstname: str | None = None
    lastname: str | None = None
    middlename: str | None = None
    ext: str | None = None
    phone: str | None = None
    is_active: bool | None = None
    date_time_email_confirmed: datetime | None = None
    admin_confirmed_by: int | None = None
    admin_confirmed_date_time: datetime | None = None
    user_qr_code: str | None = None
    auth_user_id: UUID | None = Field(default=None, alias="userID")
    salutation: str | None = None
    current_points: int | None = None
    profile_image_url: str | None = Field(
        default=None, alias="supabaseProfileImageUrl"
    )
    bio_note: str | None = Field(default=None, alias="bio note")


CSV_ROW_MODELS: dict[str, type[CsvRowModel]] = {
    "nu_buildings_rows.csv": NuBuildingRow,
    "nu_departments_rows.csv": NuDepartmentRow,
    "nu_event_attendees_log_rows.csv": NuEventAttendeeLogRow,
    "nu_event_attendees_rows.csv": NuEventAttendeeRow,
    "nu_event_question_rows.csv": NuEventQuestionRow,
    "nu_event_sessions_rows.csv": NuEventSessionRow,
    "nu_events_rows.csv": NuEventRow,
    "nu_certificate_templates_rows.csv": NuCertificateTemplateRow,
    "nu_certificates_rows.csv": NuCertificateRow,
    "nu_certificate_audits_rows.csv": NuCertificateAuditRow,
    "nu_floors_rows.csv": NuFloorRow,
    "nu_places_rows.csv": NuPlaceRow,
    "nu_rooms_rows.csv": NuRoomRow,
    "nu_user_note_rows.csv": NuUserNoteRow,
    "nu_users_rows.csv": NuUserRow,
}
