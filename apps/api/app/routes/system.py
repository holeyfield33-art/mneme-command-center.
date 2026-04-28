from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session

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

    claude_command_configured = bool(settings.claude_code_command.strip())
    anthropic_key_configured = bool(settings.anthropic_api_key.strip())
    telegram_configured = bool(settings.telegram_bot_token.strip() and settings.telegram_chat_id.strip())

    return {
        "claude_execution_required": True,
        "claude_command_configured": claude_command_configured,
        "anthropic_api_key_configured": anthropic_key_configured,
        "claude_configured": claude_command_configured and anthropic_key_configured,
        "claude_code_timeout_seconds": settings.claude_code_timeout_seconds,
        "allow_mock_claude_for_tests": settings.allow_mock_claude_for_tests,
        "notifications_enabled": settings.notifications_enabled,
        "telegram_configured": telegram_configured,
        "public_dashboard_url_configured": bool(settings.public_dashboard_url.strip()),
    }
