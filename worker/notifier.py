from __future__ import annotations

import os
import re
from typing import Optional

import requests


class WorkerNotifier:
    def __init__(self) -> None:
        self.enabled = os.getenv("NOTIFICATIONS_ENABLED", "false").strip().lower() == "true"
        self.telegram_bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        self.telegram_chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
        self.dashboard_url = os.getenv("PUBLIC_DASHBOARD_URL", "").strip().rstrip("/")

    def config_snapshot(self) -> dict[str, bool]:
        return {
            "notifications_enabled": self.enabled,
            "telegram_configured": bool(self.telegram_bot_token and self.telegram_chat_id),
        }

    def task_link(self, task_id: str) -> str:
        if not self.dashboard_url:
            return ""
        return f"{self.dashboard_url}/tasks/{task_id}"

    def approvals_link(self) -> str:
        if not self.dashboard_url:
            return ""
        return f"{self.dashboard_url}/approvals"

    def _redact(self, text: str) -> str:
        redacted = text
        for secret in (self.telegram_bot_token, os.getenv("ANTHROPIC_API_KEY", "")):
            if secret:
                redacted = redacted.replace(secret, "[REDACTED]")
        # Generic token-like patterns
        redacted = re.sub(r"(?i)(anthropic[_-]?api[_-]?key\s*[:=]\s*)(\S+)", r"\1[REDACTED]", redacted)
        redacted = re.sub(r"(?i)(telegram[_-]?bot[_-]?token\s*[:=]\s*)(\S+)", r"\1[REDACTED]", redacted)
        return redacted

    def send(self, message: str) -> tuple[bool, str]:
        sanitized = self._redact(message)

        if not self.enabled:
            return False, "notification skipped: notifications disabled"
        if not (self.telegram_bot_token and self.telegram_chat_id):
            return False, "notification skipped: telegram not configured"

        url = f"https://api.telegram.org/bot{self.telegram_bot_token}/sendMessage"
        payload = {
            "chat_id": self.telegram_chat_id,
            "text": sanitized,
            "disable_web_page_preview": True,
        }

        try:
            response = requests.post(url, json=payload, timeout=8)
        except requests.RequestException as exc:
            return False, f"notification warning: telegram request failed ({exc})"

        if response.status_code != 200:
            return False, f"notification warning: telegram send failed ({response.status_code})"

        return True, "notification sent"
