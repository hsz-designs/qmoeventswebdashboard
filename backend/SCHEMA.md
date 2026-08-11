# NU backend schema

`schema.sql` defines the 12 PostgreSQL tables represented by the supplied NU
CSV exports. The SQL column order and names match the CSV headers, including
the quoted legacy user columns `userID`, `supabaseProfileImageUrl`, and
`bio note`.

## Relationship map

```text
nu_buildings -> nu_floors -> nu_rooms -> nu_places
                                      -> nu_departments

nu_events -> nu_event_sessions
          -> nu_event_attendees -> nu_event_attendees_log
          -> nu_event_question
          -> nu_user_note

nu_users --(userID/auth UUID)--> attendees, logs, questions, and notes
```

Run `backend/schema.sql` in the Supabase SQL editor or against PostgreSQL before
importing the CSV files. Import parent tables before child tables in this order:

1. `nu_users`, `nu_buildings`, `nu_departments`
2. `nu_floors`, `nu_rooms`, `nu_places`
3. `nu_events`, `nu_event_sessions`
4. `nu_event_attendees`, `nu_event_attendees_log`, `nu_event_question`,
   `nu_user_note`

After importing, run `backend/reset_sequences.sql`. The CSVs provide explicit
primary keys, so PostgreSQL's identity sequences otherwise remain at their
initial values and can collide with imported IDs on the next insert.

The Pydantic row models in `schemas.py` provide the same types for FastAPI and
can validate dictionaries produced by Python's `csv.DictReader`.

## Event session codes

`nu_event_sessions.session_type` uses `1` for an on-site meeting and `2` for
an online meeting. `nu_event_sessions.status` uses `1` for a visible session
and `0` for an invisible or inactive session. New rows default to an on-site,
visible session.

## Source-data integrity notes

The location hierarchy and event-to-session links are enforced with foreign
keys. Some logical foreign keys are indexed but intentionally not enforced,
because the supplied files contain:

- duplicate values in `nu_users.userID`;
- attendance references to missing session IDs 36 and 37;
- question/note references to missing event IDs 15 and 29;
- user UUID references not present in `nu_users`; and
- an event host reference to missing numeric user ID 4.

The SQL enables row-level security without adding access policies. This keeps
user and attendance data private by default. Add policies appropriate to the
application before reading these tables through the Supabase client.
