import uuid
import jwt
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .models import Project, Task, Approval, Log, Worker, SystemState
from .config import settings


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    exp: float


def create_access_token(expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_minutes)
    
    to_encode = {"exp": expire.timestamp()}
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm="HS256")
    return encoded_jwt


def verify_token(token: str) -> bool:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        return True
    except jwt.ExpiredSignatureError:
        return False
    except jwt.InvalidTokenError:
        return False


def is_emergency_stop_active(db: Session) -> bool:
    """Check if emergency stop flag is set."""
    state = db.query(SystemState).filter(SystemState.key == "emergency_stop").first()
    if state:
        return state.value == "true"
    return False


def set_emergency_stop(db: Session, active: bool):
    """Set emergency stop flag."""
    state = db.query(SystemState).filter(SystemState.key == "emergency_stop").first()
    if state:
        state.value = "true" if active else "false"
    else:
        state = SystemState(key="emergency_stop", value="true" if active else "false")
        db.add(state)
    db.commit()


def generate_id() -> str:
    """Generate a unique ID."""
    return str(uuid.uuid4())
