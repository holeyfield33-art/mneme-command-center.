from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .database import engine, Base
from .models import Project, Task, Approval, Log, Worker, SystemState
from .routes import auth, projects, tasks, approvals, worker, system


def ensure_schema_compatibility() -> None:
    """Apply minimal additive schema updates for existing SQLite databases."""
    if not str(engine.url).startswith("sqlite"):
        return

    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("approvals")}
    if "risk_level" in columns:
        return

    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE approvals ADD COLUMN risk_level VARCHAR DEFAULT 'medium'")
        )

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
