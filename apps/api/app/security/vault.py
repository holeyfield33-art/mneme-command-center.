from __future__ import annotations

import base64
import logging
import os
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

from ..config import settings

logger = logging.getLogger(__name__)

_SECRET_NAME_RE = r"^[A-Z0-9_]{2,80}$"


@dataclass
class VaultStatus:
    unlocked: bool
    backend: str
    auto_lock_seconds: int
    secret_count: int


# WARNING: There is no passphrase recovery mechanism. If the vault passphrase
# is lost, all stored secrets are permanently unrecoverable. Operators must back
# up the passphrase externally before storing any secrets.
class VaultService:
    """Simple local vault with encrypted SQLite backend and session auto-lock."""

    def __init__(self) -> None:
        self._db_path = Path.home() / ".mneme" / "vault.db"
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._master_key: bytes | None = None
        self._unlocked_at: float = 0
        self._last_activity: float = 0
        self._reauth_until: float = 0
        self._auto_lock_seconds = settings.vault_auto_lock_seconds
        self._reauth_window_seconds = settings.reauth_window_seconds
        self._ensure_schema()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_schema(self) -> None:
        with self._conn() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS vault_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS vault_secrets (
                    name TEXT PRIMARY KEY,
                    ciphertext TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                )
                """
            )
            conn.commit()

    def _derive_key(self, passphrase: str, salt: bytes) -> bytes:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=390000,
        )
        return kdf.derive(passphrase.encode("utf-8"))

    def _encrypt(self, key: bytes, plaintext: str) -> str:
        nonce = os.urandom(12)
        cipher = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)
        return base64.urlsafe_b64encode(nonce + cipher).decode("ascii")

    def _decrypt(self, key: bytes, ciphertext: str) -> str:
        raw = base64.urlsafe_b64decode(ciphertext.encode("ascii"))
        nonce, body = raw[:12], raw[12:]
        plain = AESGCM(key).decrypt(nonce, body, None)
        return plain.decode("utf-8")

    def _get_meta(self, key: str) -> str | None:
        with self._conn() as conn:
            row = conn.execute("SELECT value FROM vault_meta WHERE key = ?", (key,)).fetchone()
            return row["value"] if row else None

    def _set_meta(self, key: str, value: str) -> None:
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO vault_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, value),
            )
            conn.commit()

    def _touch(self) -> None:
        now = time.time()
        self._last_activity = now
        if self._unlocked_at == 0:
            self._unlocked_at = now

    def _maybe_autolock(self) -> None:
        if not self._master_key:
            return
        if self._auto_lock_seconds <= 0:
            return
        if time.time() - self._last_activity > self._auto_lock_seconds:
            self.lock()

    def _ensure_unlocked(self) -> None:
        self._maybe_autolock()
        if not self._master_key:
            raise RuntimeError("Vault is locked")

    def _verifier_plaintext(self) -> str:
        return "mneme-vault-verifier-v1"

    def unlock(self, passphrase: str) -> None:
        if not passphrase:
            raise ValueError("Passphrase is required")

        salt_b64 = self._get_meta("salt")
        verifier = self._get_meta("verifier")

        if salt_b64 is None:
            salt = os.urandom(16)
            key = self._derive_key(passphrase, salt)
            self._set_meta("salt", base64.urlsafe_b64encode(salt).decode("ascii"))
            self._set_meta("verifier", self._encrypt(key, self._verifier_plaintext()))
            self._master_key = key
            self._unlocked_at = time.time()
            self._touch()
            logger.warning("Vault unlocked — ensure passphrase is backed up externally")
            return

        salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
        key = self._derive_key(passphrase, salt)

        try:
            if verifier is None or self._decrypt(key, verifier) != self._verifier_plaintext():
                raise ValueError("Invalid vault passphrase")
        except Exception as exc:
            raise ValueError("Invalid vault passphrase") from exc

        self._master_key = key
        self._unlocked_at = time.time()
        self._touch()
        logger.warning("Vault unlocked — ensure passphrase is backed up externally")

    def lock(self) -> None:
        self._master_key = None
        self._unlocked_at = 0
        self._last_activity = 0
        self._reauth_until = 0

    def mark_reauth(self) -> None:
        self._ensure_unlocked()
        self._touch()
        self._reauth_until = time.time() + self._reauth_window_seconds

    def has_recent_reauth(self) -> bool:
        self._maybe_autolock()
        return bool(self._master_key and time.time() <= self._reauth_until)

    def set_secret(self, name: str, value: str) -> None:
        import re

        self._ensure_unlocked()
        self._touch()
        if not re.match(_SECRET_NAME_RE, name):
            raise ValueError("Secret name must be 2-80 chars: A-Z, 0-9, underscore")
        if not value:
            raise ValueError("Secret value cannot be empty")

        ciphertext = self._encrypt(self._master_key, value)
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO vault_secrets(name, ciphertext, updated_at) VALUES(?, ?, ?) "
                "ON CONFLICT(name) DO UPDATE SET ciphertext=excluded.ciphertext, updated_at=excluded.updated_at",
                (name, ciphertext, int(time.time())),
            )
            conn.commit()

    def list_secret_names(self) -> list[str]:
        self._ensure_unlocked()
        self._touch()
        with self._conn() as conn:
            rows = conn.execute("SELECT name FROM vault_secrets ORDER BY name ASC").fetchall()
        return [row["name"] for row in rows]

    def get_secret(self, name: str) -> str:
        self._ensure_unlocked()
        self._touch()
        with self._conn() as conn:
            row = conn.execute("SELECT ciphertext FROM vault_secrets WHERE name = ?", (name,)).fetchone()
        if not row:
            raise KeyError(f"Secret not found: {name}")
        return self._decrypt(self._master_key, row["ciphertext"])

    def to_secret_token(self, name: str) -> str:
        return f"$SECRET[{name}]"

    def resolve_secret_token(self, token: str) -> str:
        if not token.startswith("$SECRET[") or not token.endswith("]"):
            raise ValueError("Invalid secret token format")
        name = token[len("$SECRET["):-1]
        return self.get_secret(name)

    def maybe_resolve_secret(self, value: str) -> str:
        if not isinstance(value, str):
            return value
        trimmed = value.strip()
        if trimmed.startswith("$SECRET[") and trimmed.endswith("]"):
            return self.resolve_secret_token(trimmed)
        return value

    def status(self) -> VaultStatus:
        self._maybe_autolock()
        count = 0
        if self._master_key:
            try:
                count = len(self.list_secret_names())
            except Exception:
                count = 0
        return VaultStatus(
            unlocked=bool(self._master_key),
            backend="encrypted_sqlite_aes256",
            auto_lock_seconds=self._auto_lock_seconds,
            secret_count=count,
        )


vault_service = VaultService()
