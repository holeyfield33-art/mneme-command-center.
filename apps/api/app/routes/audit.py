from __future__ import annotations

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

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


@router.get("/summary")
def get_audit_summary(
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    verify_token_header(authorization)

    since_24h = datetime.utcnow() - timedelta(hours=24)
    all_events = db.query(AuditLog).all()

    total = len(all_events)
    ok = sum(1 for event in all_events if event.status == "ok")
    errors = total - ok
    last_24h = sum(1 for event in all_events if event.created_at and event.created_at >= since_24h)

    operations: dict[str, int] = {}
    for event in all_events:
                op = event.operation or "unknown"
                operations[op] = operations.get(op, 0) + 1

    return {
        "total": total,
        "ok": ok,
        "errors": errors,
        "last_24h": last_24h,
        "top_operations": sorted(
            [{"operation": key, "count": value} for key, value in operations.items()],
            key=lambda item: item["count"],
            reverse=True,
        )[:5],
    }
