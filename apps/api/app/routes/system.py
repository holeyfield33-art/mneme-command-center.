from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session

from ..database import get_db
from ..utils import set_emergency_stop, is_emergency_stop_active
from .auth import verify_token_header

router = APIRouter(prefix="/system", tags=["system"])


@router.post("/emergency-stop")
def activate_emergency_stop(
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Activate emergency stop."""
    verify_token_header(authorization)
    set_emergency_stop(db, True)
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
