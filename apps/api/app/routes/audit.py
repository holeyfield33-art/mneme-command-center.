from __future__ import annotations

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AuditLog
from .auth import verify_token_header

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


class AuditLogResponse(BaseModel):
    id: str
    actor: str
    operation: str
    resource: str | None = None
    status: str
    details: dict | None = None
    created_at: str


@router.get("/events")
def list_audit_events(
    limit: int = 100,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    verify_token_header(authorization)
    safe_limit = max(1, min(limit, 500))
    events = (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(safe_limit)
        .all()
    )
    return [
        {
            "id": event.id,
            "actor": event.actor,
            "operation": event.operation,
            "resource": event.resource,
            "status": event.status,
            "details": event.details,
            "created_at": event.created_at.isoformat(),
        }
        for event in events
    ]
