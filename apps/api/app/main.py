from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from sqlalchemy import inspect, text

from .database import engine, Base
from .models import Project, Task, Approval, Log, Worker, SystemState
from .events import manager
from .routes import auth, projects, tasks, approvals, worker, system


def ensure_schema_compatibility() -> None:
    """Apply minimal additive schema updates for existing SQLite databases."""
    if not str(engine.url).startswith("sqlite"):
        return

    inspector = inspect(engine)
    approval_columns = {column["name"] for column in inspector.get_columns("approvals")}
    project_columns = {column["name"] for column in inspector.get_columns("projects")}
    with engine.begin() as connection:
        if "risk_level" not in approval_columns:
            connection.execute(
                text("ALTER TABLE approvals ADD COLUMN risk_level VARCHAR DEFAULT 'medium'")
            )
        if "plan_details" not in approval_columns:
            connection.execute(
                text("ALTER TABLE approvals ADD COLUMN plan_details JSON")
            )
        if "claude_code_command" not in project_columns:
            connection.execute(
                text("ALTER TABLE projects ADD COLUMN claude_code_command VARCHAR")
            )
        if "model_provider" not in project_columns:
            connection.execute(
                text("ALTER TABLE projects ADD COLUMN model_provider VARCHAR")
            )
        if "model_name" not in project_columns:
            connection.execute(
                text("ALTER TABLE projects ADD COLUMN model_name VARCHAR")
            )


class BroadcastRequest(BaseModel):
    event_type: str
    data: dict

# Create tables
Base.metadata.create_all(bind=engine)
ensure_schema_compatibility()

# Create FastAPI app
app = FastAPI(
    title="Mneme Command Center API",
    description="Local-first autonomous coding command center",
    version="0.1.0"
)

# Add CORS middleware to allow dashboard access from any origin (local network)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(approvals.router)
app.include_router(worker.router)
app.include_router(system.router)


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/events")
async def stream_events():
    client = manager.add_client()

    async def event_generator():
        try:
            while True:
                yield await client.get()
        finally:
            manager.remove_client(client)

    return EventSourceResponse(event_generator())


@app.post("/events/broadcast")
async def broadcast_event(request: BroadcastRequest):
    await manager.broadcast(request.event_type, request.data)
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
