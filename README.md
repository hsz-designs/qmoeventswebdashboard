# QMO Web Dashboard

A modern Next.js frontend and Python FastAPI backend architecture with Supabase-ready authentication and a polished dashboard experience.

## Frontend
- Next.js 16 with TypeScript and Tailwind
- Supabase auth integration points in the auth flow
- Dashboard sections for Users, Events, and Calendar

## Backend
- FastAPI service in backend/main.py
- Typed CRUD endpoints for all 12 NU tables under `/api`
- PostgreSQL/Supabase schema for the NU CSV exports in backend/schema.sql
- Matching Pydantic CSV/API models in backend/schemas.py

## Run locally
- Frontend: npm run dev
- Backend: `./backend/run.sh`

The backend launcher finds `python3`, creates `.venv`, installs the pinned
dependencies through the virtual environment, and starts FastAPI. It works from
either the project root or the `backend` directory.

If file watching is unavailable, start it with
`QMO_BACKEND_RELOAD=0 ./backend/run.sh`.

Copy `backend/.env.example` to `backend/.env` and add the Supabase URL and
service-role key before using CRUD routes. See `backend/API.md` for all routes.
