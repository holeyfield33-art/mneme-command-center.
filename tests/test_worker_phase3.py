import os
from pathlib import Path
import subprocess
from worker.main import MnemeWorker


class Phase3WorkerHarness(MnemeWorker):
    def __init__(self, command: str = ""):
        super().__init__(api_url="http://localhost:8000", worker_id="w1")
        self.claude_code_command = command
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.logged: list[tuple[str, str, str]] = []
        self.status_updates: list[tuple[str, str]] = []
        self.failed: list[str] = []
        self.approvals: list[tuple[str, str]] = []

    def add_task_log(self, task_id: str, level: str, message: str) -> bool:
        self.logged.append((task_id, level, message))
        return True

    def update_task_status(self, task_id: str, new_status: str) -> bool:
        self.status_updates.append((task_id, new_status))
        return True

    def set_task_branch(self, task_id: str, branch_name: str) -> bool:
        self.status_updates.append((task_id, f"branch:{branch_name}"))
        return True

    def mark_task_failed(self, task_id: str) -> bool:
        self.failed.append(task_id)
        return True

    def create_approval_request(self, task_id: str, title: str, summary: str, risk_level: str, approval_type: str = "plan") -> bool:
        self.approvals.append((task_id, approval_type))
        return True


def test_missing_claude_config_fails_task_clearly() -> None:
    worker = Phase3WorkerHarness(command="")
    worker.anthropic_api_key = ""

    ok, state = worker._run_claude_code("task-1", Path("."), Path("plans/task-1.md"))

    assert ok is False
    assert state == "failed"
    assert worker.failed == ["task-1"]
    assert any("Claude execution is required" in message for _, _, message in worker.logged)


def test_missing_anthropic_key_fails_task_clearly() -> None:
    worker = Phase3WorkerHarness(command="echo")
    worker.anthropic_api_key = ""

    ok, state = worker._run_claude_code("task-ak", Path("."), Path("plans/task-ak.md"))

    assert ok is False
    assert state == "failed"
    assert worker.failed == ["task-ak"]
    assert any("required" in message for _, _, message in worker.logged)


def test_configured_claude_path_captures_output(monkeypatch) -> None:
    worker = Phase3WorkerHarness(command="echo")
    worker.anthropic_api_key = "dummy-key"

    def fake_run_subprocess(command, cwd):
        return True, "hello stdout", "warning stderr", 0

    monkeypatch.setattr(worker, "_run_subprocess", fake_run_subprocess)

    ok, state = worker._run_claude_code("task-2", Path("."), Path("plans/task-2.md"))

    assert ok is True
    assert state == "ok"
    assert any("Claude stdout" in message for _, _, message in worker.logged)
    assert any("Claude stderr" in message for _, _, message in worker.logged)


def test_mocked_claude_only_in_explicit_test_mode(monkeypatch) -> None:
    monkeypatch.setenv("ALLOW_MOCK_CLAUDE_FOR_TESTS", "true")
    monkeypatch.setenv("ENABLE_MOCK_CLAUDE_EXECUTION", "true")

    worker = Phase3WorkerHarness(command="")
    worker.anthropic_api_key = ""
    worker.allow_mock_claude_for_tests = True
    worker.enable_mock_claude_execution = True

    ok, state = worker._run_claude_code("task-mock", Path("."), Path("plans/task-mock.md"))

    assert ok is True
    assert state == "mocked"
    assert worker.failed == []
    assert any("mocked" in message.lower() for _, _, message in worker.logged)


def test_timeout_is_reported_as_failure(monkeypatch) -> None:
    worker = Phase3WorkerHarness(command="echo")
    worker.anthropic_api_key = "dummy-key"

    def fake_run_subprocess(command, cwd):
        return False, "", "Command timed out: echo", 124

    monkeypatch.setattr(worker, "_run_subprocess", fake_run_subprocess)

    ok, state = worker._run_claude_code("task-timeout", Path("."), Path("plans/task-timeout.md"))

    assert ok is False
    assert state == "failed"
    assert worker.failed == ["task-timeout"]
    assert any("exit code 124" in message for _, _, message in worker.logged)


def test_execution_creates_diff_review_after_mocked_claude(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("ALLOW_MOCK_CLAUDE_FOR_TESTS", "true")
    monkeypatch.setenv("ENABLE_MOCK_CLAUDE_EXECUTION", "true")

    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-b", "main"], cwd=repo, check=True, capture_output=True)

    worker = Phase3WorkerHarness(command="")
    worker.anthropic_api_key = ""
    worker.allow_mock_claude_for_tests = True
    worker.enable_mock_claude_execution = True

    worker._load_repo_profile = lambda project_name: {
        "important_files": ["src/main.py"],
        "test_commands": ["pytest"],
        "detected_stack": ["python"],
        "git": {"branch": "main", "is_dirty": False},
        "repo_path": str(repo),
    }
    worker._load_plan_text = lambda task_id, summary: ("approved plan", Path("plans/task.md"))
    worker._create_execution_branch = lambda task, repo_path: (True, "mneme/test", "")
    worker._run_safe_tests = lambda task_id, repo_path, profile: [{"command": "pytest", "success": True, "exit_code": 0}]
    worker._collect_diff_summary = lambda task_id, repo_path, branch_name, test_results: (Path("plans/task_diff.md"), ["src/main.py"], "low", ["ok"])

    task = {
        "id": "task-exec",
        "project_id": "proj-1",
        "project_name": "Demo",
        "repo_path": str(repo),
        "objective": "Implement feature",
    }

    ok = worker.process_execution_task(task)

    assert ok is True
    assert ("task-exec", "diff_review") in worker.approvals
    assert any("Claude prompt generated" in message for _, _, message in worker.logged)


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
