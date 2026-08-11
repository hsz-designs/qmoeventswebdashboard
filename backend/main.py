from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel

from backend.crud import router as crud_router
from backend.database import SupabaseRestClient


@asynccontextmanager
async def lifespan(application: FastAPI):
    database = SupabaseRestClient.from_environment()
    application.state.database = database
    yield
    if database is not None:
        await database.close()


app = FastAPI(
    title="QMO API",
    description="CRUD API for the NU events and facilities tables.",
    version="1.0.0",
    lifespan=lifespan,
)

class HealthResponse(BaseModel):
    status: str
    service: str


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="qmo-api")


app.include_router(crud_router)
