# QMO CRUD API

The FastAPI backend exposes CRUD endpoints for all 12 tables defined in
`schema.sql`. It never executes `schema.sql`; database operations go through
the existing Supabase REST API.

## Configuration

Copy `backend/.env.example` to `backend/.env`, then replace the placeholders:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Keep the service-role key on the backend only. Never place it in frontend code
or commit `backend/.env`.

These are administrative endpoints and currently do not authenticate callers.
The launcher binds to localhost by default; add application authentication
before exposing the API to a public network.

Start the API with:

```bash
./backend/run.sh
```

Interactive documentation is available at `http://127.0.0.1:8000/docs`.
`GET /api` returns the table registry and field names.

## Endpoint pattern

Every table provides the same five operations:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/{table}` | List rows |
| `GET` | `/api/{table}/{record_id}` | Get one row |
| `POST` | `/api/{table}` | Create a row |
| `PATCH` | `/api/{table}/{record_id}` | Update supplied fields |
| `DELETE` | `/api/{table}/{record_id}` | Delete and return a row |

List routes accept `limit` (1-500), `offset`, `order_by`, and
`order_direction=asc|desc` query parameters.

Available table names:

- `nu_users`
- `nu_buildings`
- `nu_departments`
- `nu_floors`
- `nu_rooms`
- `nu_places`
- `nu_events`
- `nu_event_sessions`
- `nu_event_attendees`
- `nu_event_attendees_log`
- `nu_event_question`
- `nu_user_note`

Example:

```bash
curl http://127.0.0.1:8000/api/nu_buildings

curl -X POST http://127.0.0.1:8000/api/nu_buildings \
  -H 'Content-Type: application/json' \
  -d '{"building_name":"New Building","address":"Manila"}'

curl -X PATCH http://127.0.0.1:8000/api/nu_buildings/1 \
  -H 'Content-Type: application/json' \
  -d '{"address":"Updated address"}'

curl -X DELETE http://127.0.0.1:8000/api/nu_buildings/1
```

Because the SQL schema enables row-level security without public policies, the
service-role key is needed for these administrative CRUD endpoints.
