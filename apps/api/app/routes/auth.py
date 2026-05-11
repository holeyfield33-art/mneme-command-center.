import time
from fastapi import APIRouter, Depends, HTTPException, Request, status, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..models import SystemState
from ..utils import create_access_token, verify_token
from ..config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

# Rate-limiting: prevent brute-force against the single admin password.
# Per-IP counter — no external library needed.
_FAIL_WINDOW_SECONDS = 15 * 60  # 15 minutes
_MAX_FAILURES = 5
# { ip -> [timestamp, ...] } — only failed attempts are recorded.
_login_failures: dict[str, list[float]] = {}


class LoginRequest(BaseModel):
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


def verify_token_header(authorization: str = Header(None)) -> str:
    """Verify JWT token from Authorization header."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header"
        )
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise ValueError()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header"
        )
    
    if not verify_token(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    return token


@router.post("/login", response_model=Token)
def login(request: LoginRequest, http_request: Request, db: Session = Depends(get_db)):
    """Login with admin password."""
    client_ip = http_request.client.host if http_request.client else "unknown"
    now = time.time()

    # Purge timestamps outside the rolling window, then check failure count.
    failures = _login_failures.get(client_ip, [])
    failures = [t for t in failures if now - t < _FAIL_WINDOW_SECONDS]
    if len(failures) >= _MAX_FAILURES:
        retry_after = int(_FAIL_WINDOW_SECONDS - (now - failures[0]))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    if request.password != settings.admin_password:
        # Record failure and persist the pruned list.
        failures.append(now)
        _login_failures[client_ip] = failures
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password"
        )

    # Successful login — clear the failure counter for this IP.
    _login_failures.pop(client_ip, None)
    access_token = create_access_token()
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }
