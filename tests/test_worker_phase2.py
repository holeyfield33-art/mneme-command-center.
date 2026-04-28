from typing import Any

from worker.main import MnemeWorker


class FakeWorker(MnemeWorker):
    def __init__(self):
        super().__init__(api_url="http://localhost:8000", worker_id="test-worker")
        self.logs: list[tuple[str, str, str]] = []
        self.marked_failed: list[str] = []

    def mark_task_planning(self, task_id: str) -> bool:
        return True

    def add_task_log(self, task_id: str, level: str, message: str) -> bool:
        self.logs.append((task_id, level, message))
        return True

    def mark_task_failed(self, task_id: str) -> bool:
        self.marked_failed.append(task_id)
        return True

    def create_approval_request(self, task_id: str, title: str, summary: str, risk_level: str) -> bool:
        return True


def test_invalid_repo_path_marks_task_failed() -> None:
    worker = FakeWorker()
    task: dict[str, Any] = {
        "id": "task-1",
        "project_id": "proj-1",
        "project_name": "Demo",
        "repo_path": "/tmp/does-not-exist-repo",
        "objective": "Do something",
        "mode": "interactive",
        "risk_level": "medium",
        "status": "queued",
    }

    ok = worker.process_task(task)

    assert ok is False
    assert worker.marked_failed == ["task-1"]
    assert any("Repository validation failed" in message for _, _, message in worker.logs)


def test_missing_repo_path_marks_task_failed() -> None:
    worker = FakeWorker()
    task: dict[str, Any] = {
        "id": "task-2",
        "project_id": "proj-1",
        "project_name": "Demo",
        "objective": "Do something",
        "mode": "interactive",
        "risk_level": "medium",
        "status": "queued",
    }

    ok = worker.process_task(task)

    assert ok is False
    assert worker.marked_failed == ["task-2"]
    assert any("repo_path is missing" in message for _, _, message in worker.logs)
