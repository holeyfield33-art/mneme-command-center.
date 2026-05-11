from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
import os
from pathlib import Path
from pydantic import BaseModel
import httpx

from ..database import get_db
from ..utils import set_emergency_stop, is_emergency_stop_active
from ..config import settings
from ..notifier import ApiNotifier
from ..security.vault import vault_service
from .auth import verify_token_header

router = APIRouter(prefix="/system", tags=["system"])
notifier = ApiNotifier()


def _resolve_secret(value: str) -> str:
    try:
        return vault_service.maybe_resolve_secret(value.strip())
    except RuntimeError:
        return ""


def _active_model_name() -> str:
    provider = settings.model_provider.lower()
    if provider == "anthropic":
        return settings.anthropic_model
    if provider == "openai":
        return settings.openai_model
    if provider == "google":
        return settings.google_model
    if provider == "ollama":
        return settings.ollama_model
    return ""


def _provider_health(provider: str) -> dict:
    provider = provider.lower()

    if provider == "anthropic":
        anthropic_key = _resolve_secret(settings.anthropic_api_key)
        if not anthropic_key:
            return {"reachable": False, "status": "missing_key", "error": "ANTHROPIC_API_KEY not set or vault locked"}
        try:
            response = httpx.get(
                "https://api.anthropic.com/v1/models",
                headers={
                    "x-api-key": anthropic_key,
                    "anthropic-version": "2023-06-01",
                },
                timeout=4,
            )
            if response.status_code == 200:
                return {"reachable": True, "status": "ok"}
            return {"reachable": False, "status": "error", "error": f"HTTP {response.status_code}"}
        except Exception as exc:
            return {"reachable": False, "status": "error", "error": str(exc)}

    if provider == "openai":
        openai_key = _resolve_secret(settings.openai_api_key)
        if not openai_key:
            return {"reachable": False, "status": "missing_key", "error": "OPENAI_API_KEY not set or vault locked"}
        try:
            response = httpx.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {openai_key}"},
                timeout=4,
            )
            if response.status_code == 200:
                return {"reachable": True, "status": "ok"}
            return {"reachable": False, "status": "error", "error": f"HTTP {response.status_code}"}
        except Exception as exc:
            return {"reachable": False, "status": "error", "error": str(exc)}

    if provider == "google":
        google_key = _resolve_secret(settings.google_api_key)
        if not google_key:
            return {"reachable": False, "status": "missing_key", "error": "GOOGLE_API_KEY not set or vault locked"}
        try:
            response = httpx.get(
                "https://generativelanguage.googleapis.com/v1beta/models",
                params={"key": google_key},
                timeout=4,
            )
            if response.status_code == 200:
                return {"reachable": True, "status": "ok"}
            return {"reachable": False, "status": "error", "error": f"HTTP {response.status_code}"}
        except Exception as exc:
            return {"reachable": False, "status": "error", "error": str(exc)}

    if provider == "ollama":
        try:
            response = httpx.get(
                f"{settings.ollama_base_url.rstrip('/')}/api/tags",
                timeout=4,
            )
            if response.status_code == 200:
                return {"reachable": True, "status": "ok"}
            return {"reachable": False, "status": "error", "error": f"HTTP {response.status_code}"}
        except Exception as exc:
            return {"reachable": False, "status": "error", "error": str(exc)}

    return {"reachable": False, "status": "unknown_provider", "error": f"Unknown provider: {provider}"}


@router.post("/emergency-stop")
def activate_emergency_stop(
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Activate emergency stop."""
    verify_token_header(authorization)
    set_emergency_stop(db, True)
    notifier.send("MNEME EMERGENCY STOP activated. Worker will halt task processing.")
    return {"status": "emergency_stop_activated"}


@router.post("/emergency-stop/clear")
def clear_emergency_stop(
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Clear emergency stop."""
    verify_token_header(authorization)
    set_emergency_stop(db, False)
    return {"status": "emergency_stop_cleared"}


@router.get("/emergency-stop/status")
def get_emergency_stop_status(
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Get emergency stop status."""
    verify_token_header(authorization)
    active = is_emergency_stop_active(db)
    return {"active": active}


@router.get("/runtime-status")
def get_runtime_status(
    authorization: str = Header(None),
):
    """Expose safe runtime configuration flags for dashboard diagnostics."""
    verify_token_header(authorization)

    provider = settings.model_provider
    provider_key_map = {
        "anthropic": bool(_resolve_secret(settings.anthropic_api_key)),
        "openai": bool(_resolve_secret(settings.openai_api_key)),
        "google": bool(_resolve_secret(settings.google_api_key)),
        "ollama": True,  # no key needed
    }
    telegram_configured = bool(settings.telegram_bot_token.strip() and settings.telegram_chat_id.strip())

    anthropic_health = _provider_health("anthropic")
    openai_health = _provider_health("openai")
    google_health = _provider_health("google")
    ollama_health = _provider_health("ollama")

    return {
        # Multi-model
        "model_provider": provider,
        "active_model": _active_model_name(),
        "model_provider_key_configured": provider_key_map.get(provider, False),
        "available_providers": {
            "anthropic": {
                "configured": provider_key_map["anthropic"],
                "model": settings.anthropic_model,
                "health": anthropic_health,
            },
            "openai": {
                "configured": provider_key_map["openai"],
                "model": settings.openai_model,
                "health": openai_health,
            },
            "google": {
                "configured": provider_key_map["google"],
                "model": settings.google_model,
                "health": google_health,
            },
            "ollama": {
                "configured": True,
                "url": settings.ollama_base_url,
                "model": settings.ollama_model,
                "health": ollama_health,
            },
        },
        # GitHub
        "github_configured": bool(_resolve_secret(settings.github_token)),
        # Legacy Claude CLI
        "claude_command_configured": bool(settings.claude_code_command.strip()),
        "claude_code_timeout_seconds": settings.claude_code_timeout_seconds,
        "claude_code_max_retries": settings.claude_code_max_retries,
        # Security controls
        "vault_auto_lock_seconds": settings.vault_auto_lock_seconds,
        "reauth_window_seconds": settings.reauth_window_seconds,
        "require_reauth_for_remote_push": settings.require_reauth_for_remote_push,
        # Notifications
        "notifications_enabled": settings.notifications_enabled,
        "telegram_configured": telegram_configured,
        "public_dashboard_url_configured": bool(settings.public_dashboard_url.strip()),
        # Cost guardrails
        "cost_guardrails": {
            "daily_cost_limit_usd": settings.daily_cost_limit_usd,
            "task_cost_limit_usd": settings.task_cost_limit_usd,
            "enforce_cost_limits": settings.enforce_cost_limits,
        },
    }


class SettingsUpdate(BaseModel):
    MODEL_PROVIDER: str | None = None
    ANTHROPIC_API_KEY: str | None = None
    ANTHROPIC_MODEL: str | None = None
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str | None = None
    GOOGLE_API_KEY: str | None = None
    GOOGLE_MODEL: str | None = None
    OLLAMA_BASE_URL: str | None = None
    OLLAMA_MODEL: str | None = None
    GITHUB_TOKEN: str | None = None
    TELEGRAM_BOT_TOKEN: str | None = None
    TELEGRAM_CHAT_ID: str | None = None
    PUBLIC_DASHBOARD_URL: str | None = None
    NOTIFICATIONS_ENABLED: str | None = None
    MNEME_ADMIN_PASSWORD: str | None = None
    DAILY_COST_LIMIT_USD: str | None = None
    TASK_COST_LIMIT_USD: str | None = None
    ENFORCE_COST_LIMITS: str | None = None
    VAULT_AUTO_LOCK_SECONDS: str | None = None
    REAUTH_WINDOW_SECONDS: str | None = None
    REQUIRE_REAUTH_FOR_REMOTE_PUSH: str | None = None


@router.put("/settings")
def update_settings(
    body: SettingsUpdate,
    authorization: str = Header(None),
):
    """
    Persist settings to the .env file at the workspace root and reload live values.
    Only non-None fields are written.
    """
    verify_token_header(authorization)

    env_path = Path(__file__).resolve().parents[4] / ".env"

    # Read existing lines
    existing: dict[str, str] = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                existing[k.strip()] = v.strip()

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    for k, v in updates.items():
        if any(ch in v for ch in ("\n", "\r", "\x00")):
            raise HTTPException(status_code=400, detail=f"Invalid control characters in {k}")

    if "VAULT_AUTO_LOCK_SECONDS" in updates:
        try:
            auto_lock_seconds = int(updates["VAULT_AUTO_LOCK_SECONDS"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="VAULT_AUTO_LOCK_SECONDS must be an integer") from exc

        if auto_lock_seconds <= 0:
            raise HTTPException(status_code=400, detail="VAULT_AUTO_LOCK_SECONDS must be positive")
        if auto_lock_seconds > 900:
            raise HTTPException(status_code=400, detail="VAULT_AUTO_LOCK_SECONDS cannot exceed 900 seconds (15 minutes)")

    existing.update(updates)

    # Write back
    lines = [f"{k}={v}" for k, v in existing.items()]
    env_path.write_text("\n".join(lines) + "\n")

    # Reload live settings object (best-effort; process restart picks up the rest)
    for k, v in updates.items():
        os.environ[k] = v
        attr = k.lower()
        if hasattr(settings, attr):
            current = getattr(settings, attr)
            if isinstance(current, bool):
                setattr(settings, attr, v.lower() == "true")
            elif isinstance(current, int):
                try:
                    setattr(settings, attr, int(v))
                except ValueError:
                    pass
            elif isinstance(current, float):
                try:
                    setattr(settings, attr, float(v))
                except ValueError:
                    pass
            else:
                setattr(settings, attr, v)

    return {"status": "saved", "keys_updated": list(updates.keys())}
