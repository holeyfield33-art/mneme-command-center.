import uuid
import hashlib
import os
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .models import Project, Task, Approval, Log, Worker, SystemState
from .config import settings


def hash_password(password: str) -> str:
    """Hash a password using SHA256 with a salt.
    
    Format: salt:hash for easy storage and verification.
    """
    salt = os.urandom(32).hex()
    pwd_hash = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{pwd_hash}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its hash.
    
    Expects format: salt:hash
    """
    try:
        salt, stored_hash = hashed_password.split(":", 1)
        pwd_hash = hashlib.sha256((salt + plain_password).encode()).hexdigest()
        return pwd_hash == stored_hash
    except (ValueError, AttributeError):
        return False


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
    except ExpiredSignatureError:
        return False
    except JWTError:
        return False


# Canonical prompt-injection markers that must never reach the LLM system prompt.
_INJECTION_PATTERNS = ["ignore previous instructions", "###system"]


def sanitize_objective(text: str) -> str:
    """Clean task objective before it is stored or forwarded to the agent.

    Raises ValueError for strings that contain known prompt-injection markers
    so the caller can translate this into an HTTP 422 response.
    """
    text = text.strip()              # Remove leading/trailing whitespace
    text = text.replace("\x00", "")  # Strip null bytes
    text = text[:4000]               # Hard truncation — protects token budget

    lower = text.lower()
    for marker in _INJECTION_PATTERNS:
        if marker in lower:
            raise ValueError(
                f"Objective contains a disallowed injection marker: '{marker}'"
            )
    return text


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
