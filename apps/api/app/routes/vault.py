from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..security.audit import log_audit_event
from ..security.vault import vault_service
from .auth import verify_token_header

router = APIRouter(prefix="/api/v1/vault", tags=["vault"])


class VaultUnlockRequest(BaseModel):
    passphrase: str


class VaultSecretUpsertRequest(BaseModel):
    value: str


@router.get("/status")
def get_vault_status(
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    verify_token_header(authorization)
    status_obj = vault_service.status()
    log_audit_event(
        db,
        actor="user",
        operation="vault.status",
        resource="vault",
        status="ok",
        details={"unlocked": status_obj.unlocked},
    )
    db.commit()
    return {
        "unlocked": status_obj.unlocked,
        "backend": status_obj.backend,
        "auto_lock_seconds": status_obj.auto_lock_seconds,
        "secret_count": status_obj.secret_count,
    }


@router.post("/unlock")
def unlock_vault(
    body: VaultUnlockRequest,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    verify_token_header(authorization)
    try:
        vault_service.unlock(body.passphrase)
    except ValueError as exc:
        log_audit_event(
            db,
            actor="user",
            operation="vault.unlock",
            resource="vault",
            status="denied",
            details={"error": str(exc)},
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    log_audit_event(
        db,
        actor="user",
        operation="vault.unlock",
        resource="vault",
        status="ok",
    )
    db.commit()
    return {"status": "unlocked"}


@router.post("/lock")
def lock_vault(
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    verify_token_header(authorization)
    vault_service.lock()
    log_audit_event(
        db,
        actor="user",
        operation="vault.lock",
        resource="vault",
        status="ok",
    )
    db.commit()
    return {"status": "locked"}


@router.post("/reauth")
def mark_sensitive_reauth(
    body: VaultUnlockRequest,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    verify_token_header(authorization)
    try:
        vault_service.unlock(body.passphrase)
        vault_service.mark_reauth()
    except ValueError as exc:
        log_audit_event(
            db,
            actor="user",
            operation="vault.reauth",
            resource="vault",
            status="denied",
            details={"error": str(exc)},
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    log_audit_event(
        db,
        actor="user",
        operation="vault.reauth",
        resource="vault",
        status="ok",
    )
    db.commit()
    return {"status": "reauthenticated"}


@router.put("/secrets/{name}")
def upsert_secret(
    name: str,
    body: VaultSecretUpsertRequest,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    verify_token_header(authorization)
    try:
        vault_service.set_secret(name, body.value)
    except (ValueError, RuntimeError) as exc:
        log_audit_event(
            db,
            actor="user",
            operation="vault.secret.write",
            resource=name,
            status="denied",
            details={"error": str(exc)},
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    log_audit_event(
        db,
        actor="user",
        operation="vault.secret.write",
        resource=name,
        status="ok",
        details={"token": vault_service.to_secret_token(name)},
    )
    db.commit()
    return {"status": "saved", "token": vault_service.to_secret_token(name)}


@router.get("/secrets")
def list_secrets(
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    verify_token_header(authorization)
    try:
        names = vault_service.list_secret_names()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    log_audit_event(
        db,
        actor="user",
        operation="vault.secret.list",
        resource="vault",
        status="ok",
        details={"count": len(names)},
    )
    db.commit()
    return {"secrets": names}


@router.get("/secrets/{name}/token")
def get_secret_token(
    name: str,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    verify_token_header(authorization)
    try:
        # Only validate presence; do not return secret value.
        _ = vault_service.get_secret(name)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Secret not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    token = vault_service.to_secret_token(name)
    log_audit_event(
        db,
        actor="user",
        operation="vault.secret.tokenize",
        resource=name,
        status="ok",
        details={"token": token},
    )
    db.commit()
    return {"token": token}
