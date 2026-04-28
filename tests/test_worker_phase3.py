from pathlib import Path
from worker.main import MnemeWorker


class Phase3WorkerHarness(MnemeWorker):
    def __init__(self, command: str = ""):
        super().__init__(api_url="http://localhost:8000", worker_id="w1")
        self.claude_code_command = command
        self.logged: list[tuple[str, str, str]] = []
        self.status_updates: list[tuple[str, str]] = []

    def add_task_log(self, task_id: str, level: str, message: str) -> bool:
        self.logged.append((task_id, level, message))
        return True

    def update_task_status(self, task_id: str, new_status: str) -> bool:
        self.status_updates.append((task_id, new_status))
        return True


def test_disabled_claude_path_marks_manual_execution() -> None:
    worker = Phase3WorkerHarness(command="")

    ok, state = worker._run_claude_code("task-1", Path("."), Path("plans/task-1.md"))

    assert ok is False
    assert state == "disabled"
    assert ("task-1", "waiting_for_manual_execution") in worker.status_updates
    assert any("not configured" in message for _, _, message in worker.logged)


def test_configured_claude_path_captures_output(monkeypatch) -> None:
    worker = Phase3WorkerHarness(command="echo")

    def fake_run_subprocess(command, cwd):
        return True, "hello stdout", "warning stderr", 0

    monkeypatch.setattr(worker, "_run_subprocess", fake_run_subprocess)

    ok, state = worker._run_claude_code("task-2", Path("."), Path("plans/task-2.md"))

    assert ok is True
    assert state == "ok"
    assert any("Claude stdout" in message for _, _, message in worker.logged)
    assert any("Claude stderr" in message for _, _, message in worker.logged)


def test_no_commit_or_push_in_safe_test_commands() -> None:
    worker = Phase3WorkerHarness(command="")
    profile = {"test_commands": ["pytest", "git commit -m test", "git push"]}

    executed_commands: list[str] = []

    def fake_run_subprocess(command, cwd):
        executed_commands.append(" ".join(command))
        return True, "", "", 0

    worker._run_subprocess = fake_run_subprocess  # type: ignore[assignment]
    worker._run_safe_tests("task-3", Path("."), profile)

    assert executed_commands == ["pytest"]
