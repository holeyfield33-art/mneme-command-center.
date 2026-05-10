from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
import os
from pathlib import Path
from pydantic import BaseModel

from ..database import get_db
from ..utils import set_emergency_stop, is_emergency_stop_active
from ..config import settings
from ..notifier import ApiNotifier
from .auth import verify_token_header

router = APIRouter(prefix="/system", tags=["system"])
notifier = ApiNotifier()


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
        "anthropic": bool(settings.anthropic_api_key.strip()),
        "openai": bool(settings.openai_api_key.strip()),
        "google": bool(settings.google_api_key.strip()),
        "ollama": True,  # no key needed
    }
    telegram_configured = bool(settings.telegram_bot_token.strip() and settings.telegram_chat_id.strip())

    return {
        # Multi-model
        "model_provider": provider,
        "model_provider_key_configured": provider_key_map.get(provider, False),
        "available_providers": {
            "anthropic": {"configured": provider_key_map["anthropic"], "model": settings.anthropic_model},
            "openai": {"configured": provider_key_map["openai"], "model": settings.openai_model},
            "google": {"configured": provider_key_map["google"], "model": settings.google_model},
            "ollama": {"configured": True, "url": settings.ollama_base_url, "model": settings.ollama_model},
        },
        # GitHub
        "github_configured": bool(settings.github_token.strip()),
        # Legacy Claude CLI
        "claude_command_configured": bool(settings.claude_code_command.strip()),
        "claude_code_timeout_seconds": settings.claude_code_timeout_seconds,
        "claude_code_max_retries": settings.claude_code_max_retries,
        # Notifications
        "notifications_enabled": settings.notifications_enabled,
        "telegram_configured": telegram_configured,
        "public_dashboard_url_configured": bool(settings.public_dashboard_url.strip()),
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
            else:
                setattr(settings, attr, v)

    return {"status": "saved", "keys_updated": list(updates.keys())}
