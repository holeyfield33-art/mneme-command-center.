from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))

from worker.notifier import WorkerNotifier
from app.notifier import ApiNotifier


def test_worker_notification_skipped_when_disabled(monkeypatch) -> None:
    monkeypatch.setenv("NOTIFICATIONS_ENABLED", "false")
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)

    notifier = WorkerNotifier()
    ok, message = notifier.send("hello")

    assert ok is False
    assert "skipped" in message


def test_worker_notification_skipped_when_missing_token(monkeypatch) -> None:
    monkeypatch.setenv("NOTIFICATIONS_ENABLED", "true")
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "123")

    notifier = WorkerNotifier()
    ok, message = notifier.send("hello")

    assert ok is False
    assert "telegram not configured" in message


def test_worker_notification_send_called_when_configured(monkeypatch) -> None:
    monkeypatch.setenv("NOTIFICATIONS_ENABLED", "true")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-bot-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "123")

    called = {"count": 0, "text": ""}

    class FakeResponse:
        status_code = 200

    def fake_post(url, json, timeout):
        called["count"] += 1
        called["text"] = json["text"]
        return FakeResponse()

    monkeypatch.setattr("worker.notifier.requests.post", fake_post)

    notifier = WorkerNotifier()
    ok, message = notifier.send("secret TELEGRAM_BOT_TOKEN=abc")

    assert ok is True
    assert called["count"] == 1
    assert "[REDACTED]" in called["text"]


def test_worker_notification_failure_does_not_raise(monkeypatch) -> None:
    monkeypatch.setenv("NOTIFICATIONS_ENABLED", "true")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "123")

    class FakeResponse:
        status_code = 500

    monkeypatch.setattr("worker.notifier.requests.post", lambda url, json, timeout: FakeResponse())

    notifier = WorkerNotifier()
    ok, message = notifier.send("hello")

    assert ok is False
    assert "warning" in message


def test_api_notification_link_generation(monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_DASHBOARD_URL", "https://example.test")

    notifier = ApiNotifier()

    assert notifier.task_link("task-1") == "https://example.test/tasks/task-1"
    assert notifier.approvals_link() == "https://example.test/approvals"
