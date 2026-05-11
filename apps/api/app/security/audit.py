from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..models import AuditLog
from ..utils import generate_id


def log_audit_event(
    db: Session,
    *,
    actor: str,
    operation: str,
    resource: str | None = None,
    status: str = "ok",
    details: dict[str, Any] | None = None,
) -> AuditLog:
    event = AuditLog(
        id=generate_id(),
        actor=actor,
        operation=operation,
        resource=resource,
        status=status,
        details=details,
    )
    db.add(event)
    db.flush()
    return event
