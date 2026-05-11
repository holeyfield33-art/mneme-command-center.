#!/usr/bin/env python3
"""
Mneme Worker - Polls for tasks and creates approval requests.
Runs locally to process tasks from the API.
"""

import logging
import os
import sys
import time
import uuid
import json
import re
import requests
import socket
import shlex
import subprocess
import shutil
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Callable

from worker.repo_planning import (
    build_repo_profile,
    choose_branch_name,
    classify_changed_file_risk,
    collect_git_summary,
    estimate_risk_level,
    generate_claude_prompt_markdown,
    generate_diff_summary_markdown,
    generate_plan_markdown,
    is_safe_test_command,
    normalize_changed_files,
    save_json,
    save_markdown,
    scan_repo,
    slugify_project_name,
    validate_repo_path,
)
from worker.checkpointer import clear_checkpoint, load_checkpoint, save_checkpoint
from worker.notifier import WorkerNotifier
from worker.llm_client import build_agent_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


class MnemeWorker:
    def __init__(self, api_url: str, worker_id: Optional[str] = None):
        self.api_url = api_url.rstrip('/')
        self.worker_id = worker_id or str(uuid.uuid4())
        self.hostname = socket.gethostname()
        self.last_heartbeat = None
        self.running = True
        self.workspace_root = Path(__file__).resolve().parents[1]
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        self.claude_code_command = os.getenv("CLAUDE_CODE_COMMAND", "").strip()
        self.command_timeout_seconds = int(
            os.getenv("CLAUDE_CODE_TIMEOUT_SECONDS", os.getenv("MNEME_COMMAND_TIMEOUT", "900"))
        )
        self.claude_max_retries = max(1, int(os.getenv("CLAUDE_CODE_MAX_RETRIES", "1")))
        self.claude_retry_delay_seconds = max(0, int(os.getenv("CLAUDE_CODE_RETRY_DELAY_SECONDS", "3")))
        self.claude_artifact_dir = Path(os.getenv("CLAUDE_ARTIFACT_DIR", str(self.workspace_root / "plans")))
        self.allow_mock_claude_for_tests = os.getenv("ALLOW_MOCK_CLAUDE_FOR_TESTS", "false").strip().lower() == "true"
        self.enable_mock_claude_execution = os.getenv("ENABLE_MOCK_CLAUDE_EXECUTION", "false").strip().lower() == "true"
        self.agent_max_iterations = int(os.getenv("AGENT_MAX_ITERATIONS", "30"))
        self.notifier = WorkerNotifier()
        self._online_notified = False

    def _sanitize_notification_text(self, text: str) -> str:
        sanitized = text
        for secret in [self.anthropic_api_key, os.getenv("TELEGRAM_BOT_TOKEN", "").strip()]:
            if secret:
                sanitized = sanitized.replace(secret, "[REDACTED]")
        sanitized = re.sub(r"(?i)anthropic[_-]?api[_-]?key\s*[:=]\s*\S+", "ANTHROPIC_API_KEY=[REDACTED]", sanitized)
        return sanitized

    def _notify(self, message: str, task_id: str | None = None, level: str = "info") -> None:
        safe_message = self._sanitize_notification_text(message)
        sent, status_message = self.notifier.send(safe_message)
        if task_id:
            prefix = "Notification sent" if sent else "Notification status"
            self.add_task_log(task_id, level if sent else "warning", f"{prefix}: {status_message}")

    def _is_test_mode(self) -> bool:
        return bool(os.getenv("PYTEST_CURRENT_TEST"))

    def _mock_claude_enabled(self) -> bool:
        explicit_enable = self.enable_mock_claude_execution
        allowed_context = self._is_test_mode() or self.allow_mock_claude_for_tests
        return explicit_enable and allowed_context
        
    def heartbeat(self) -> bool:
        """Send heartbeat to API."""
        try:
            response = requests.post(
                f"{self.api_url}/worker/heartbeat",
                json={
                    "worker_id": self.worker_id,
                    "hostname": self.hostname
                },
                timeout=5
            )
            if response.status_code == 200:
                self.last_heartbeat = datetime.now()
                data = response.json()
                if data.get("emergency_stop"):
                    logger.warning("Emergency stop is active. Will not process tasks.")
                    return False
                logger.info("Heartbeat sent at %s", self.last_heartbeat.isoformat())
                return True
            else:
                logger.error("Heartbeat failed: %s", response.status_code)
                return False
        except requests.RequestException as e:
            logger.exception("Heartbeat error")
            return False

    def get_queued_tasks(self) -> list:
        """Get queued tasks from API."""
        try:
            response = requests.get(
                f"{self.api_url}/worker/tasks/queued",
                timeout=5
            )
            if response.status_code == 200:
                tasks = response.json()
                logger.info("Found %d queued tasks", len(tasks))
                return tasks
            else:
                logger.error("Failed to get tasks: %s", response.status_code)
                return []
        except requests.RequestException as e:
            logger.exception("Error getting tasks")
            return []

    def get_execution_ready_tasks(self) -> list:
        """Get tasks that have approved plans and are ready for execution."""
        try:
            response = requests.get(
                f"{self.api_url}/worker/tasks/execution-ready",
                timeout=5
            )
            if response.status_code == 200:
                tasks = response.json()
                logger.info("Found %d execution-ready tasks", len(tasks))
                return tasks
            logger.error("Failed to get execution tasks: %s", response.status_code)
            return []
        except requests.RequestException as e:
            logger.exception("Error getting execution tasks")
            return []

    def broadcast_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Broadcast an internal SSE event through API best-effort."""
        try:
            requests.post(
                f"{self.api_url}/events/broadcast",
                json={"event_type": event_type, "data": data},
                timeout=3,
            )
        except requests.RequestException:
            pass

    def mark_task_planning(self, task_id: str) -> bool:
        """Mark task as planning."""
        try:
            response = requests.put(
                f"{self.api_url}/worker/tasks/{task_id}/planning",
                timeout=5
            )
            if response.status_code == 200:
                logger.info("Task %s marked as planning", task_id)
                return True
            else:
                logger.error("Failed to mark task as planning: %s", response.status_code)
                return False
        except requests.RequestException as e:
            logger.exception("Error marking task as planning")
            return False

    def mark_task_failed(self, task_id: str) -> bool:
        """Mark task as failed."""
        try:
            response = requests.put(
                f"{self.api_url}/worker/tasks/{task_id}/failed",
                timeout=5
            )
            if response.status_code == 200:
                logger.info("Task %s marked as failed", task_id)
                clear_checkpoint()
                return True
            logger.error("Failed to mark task as failed: %s", response.status_code)
            return False
        except requests.RequestException as e:
            logger.exception("Error marking task as failed")
            return False

    def update_task_status(self, task_id: str, new_status: str) -> bool:
        """Set task status from worker route."""
        try:
            response = requests.put(
                f"{self.api_url}/worker/tasks/{task_id}/status",
                params={"new_status": new_status},
                timeout=5,
            )
            if response.status_code == 200:
                self.broadcast_event(
                    "task_status_changed",
                    {"task_id": task_id, "status": new_status},
                )
                return True
            return False
        except requests.RequestException:
            return False

    def set_task_branch(self, task_id: str, branch_name: str) -> bool:
        """Persist branch name for task."""
        try:
            response = requests.put(
                f"{self.api_url}/worker/tasks/{task_id}/branch",
                params={"branch_name": branch_name},
                timeout=5,
            )
            return response.status_code == 200
        except requests.RequestException:
            return False

    def add_task_log(self, task_id: str, level: str, message: str) -> bool:
        """Add a log to a task."""
        try:
            response = requests.post(
                f"{self.api_url}/worker/tasks/{task_id}/logs",
                json={
                    "level": level,
                    "message": message
                },
                timeout=5
            )
            if response.status_code == 200:
                logger.info("[%s] %s", level.upper(), message)
                self.broadcast_event(
                    "task_log_added",
                    {"task_id": task_id, "level": level, "message": message},
                )
                return True
            else:
                logger.error("Failed to add log: %s", response.status_code)
                return False
        except requests.RequestException as e:
            logger.exception("Error adding log")
            return False

    def create_approval_request(
        self,
        task_id: str,
        title: str,
        summary: str,
        risk_level: str,
        approval_type: str = "plan",
        plan_details: Optional[dict[str, Any]] = None,
    ) -> bool:
        """Create an approval request for a task."""
        try:
            response = requests.post(
                f"{self.api_url}/worker/tasks/{task_id}/approval-request",
                params={
                    "title": title,
                    "summary": summary,
                    "risk_level": risk_level,
                    "approval_type": approval_type,
                    "plan_details_json": json.dumps(plan_details) if plan_details else None,
                },
                timeout=5
            )
            if response.status_code == 200:
                logger.info("Approval request created for task %s", task_id)
                self.broadcast_event(
                    "approval_created",
                    {
                        "task_id": task_id,
                        "approval_type": approval_type,
                        "risk_level": risk_level,
                    },
                )
                return True
            else:
                logger.error("Failed to create approval request: %s", response.status_code)
                return False
        except requests.RequestException as e:
            logger.exception("Error creating approval request")
            return False

    def _profile_path(self, project_name: str) -> Path:
        slug = slugify_project_name(project_name)
        return self.workspace_root / "repo_profiles" / f"{slug}.json"

    def _plan_path(self, task_id: str) -> Path:
        return self.workspace_root / "plans" / f"{task_id}.md"

    def _claude_prompt_path(self, task_id: str) -> Path:
        return self.workspace_root / "plans" / f"{task_id}_claude_prompt.md"

    def _diff_summary_path(self, task_id: str) -> Path:
        return self.workspace_root / "plans" / f"{task_id}_diff_summary.md"

    def _claude_stdout_path(self, task_id: str) -> Path:
        return self.claude_artifact_dir / f"{task_id}_claude_stdout.log"

    def _claude_stderr_path(self, task_id: str) -> Path:
        return self.claude_artifact_dir / f"{task_id}_claude_stderr.log"

    def _claude_meta_path(self, task_id: str) -> Path:
        return self.claude_artifact_dir / f"{task_id}_claude_run.json"

    def _plan_excerpt(self, plan_markdown: str, max_chars: int = 500) -> str:
        if len(plan_markdown) <= max_chars:
            return plan_markdown
        return plan_markdown[:max_chars].rstrip() + "\n..."

    def _extract_plan_details(self, plan_markdown: str) -> dict[str, Any]:
        """Build a lightweight structured preview from a markdown plan."""
        path_pattern = re.compile(r"([A-Za-z0-9_./-]+\.[A-Za-z0-9_]+)")
        files: list[dict[str, str]] = []
        seen_paths: set[str] = set()

        for raw_line in plan_markdown.splitlines():
            line = raw_line.strip()
            if not line:
                continue

            match = path_pattern.search(line)
            if not match:
                continue

            file_path = match.group(1)
            if "/" not in file_path and file_path.count(".") == 1:
                continue
            if file_path in seen_paths:
                continue

            files.append({"path": file_path, "changes": line})
            seen_paths.add(file_path)

        return {"files": files}

    def _log_git_summary(self, task_id: str, git_summary: Dict[str, Any]) -> None:
        branch = git_summary.get("branch", "unknown")
        dirty = git_summary.get("is_dirty", False)
        remotes = "; ".join(git_summary.get("remotes", [])) or "none"
        self.add_task_log(task_id, "info", f"Git branch: {branch}")
        self.add_task_log(task_id, "info", f"Working tree dirty: {dirty}")
        self.add_task_log(task_id, "info", f"Git remotes: {remotes}")

    def _log_scan_summary(self, task_id: str, scan_result: Dict[str, Any]) -> None:
        found_files = ", ".join(scan_result.get("found_files", [])) or "none"
        found_dirs = ", ".join(scan_result.get("found_directories", [])) or "none"
        self.add_task_log(task_id, "info", f"Repo scan files: {found_files}")
        self.add_task_log(task_id, "info", f"Repo scan directories: {found_dirs}")

    def _run_subprocess(self, command: list[str], cwd: Path) -> tuple[bool, str, str, int]:
        try:
            result = subprocess.run(
                command,
                cwd=cwd,
                check=False,
                capture_output=True,
                text=True,
                timeout=self.command_timeout_seconds,
            )
            return result.returncode == 0, result.stdout or "", result.stderr or "", result.returncode
        except subprocess.TimeoutExpired as exc:
            return False, exc.stdout or "", f"Command timed out: {' '.join(command)}", 124
        except OSError as exc:
            return False, "", str(exc), 1

    def _build_claude_command(self, prompt_path: Path, command_template: str) -> list[str]:
        command_parts = shlex.split(command_template)
        replaced_parts: list[str] = []
        has_prompt_placeholder = False
        prompt_value = str(prompt_path)

        for part in command_parts:
            if "{prompt_file}" in part:
                has_prompt_placeholder = True
                replaced_parts.append(part.replace("{prompt_file}", prompt_value))
            else:
                replaced_parts.append(part)

        if not has_prompt_placeholder:
            replaced_parts.append(prompt_value)

        return replaced_parts

    def _validate_claude_command(self, command: list[str]) -> tuple[bool, str]:
        if not command:
            return False, "Claude command is empty"

        executable = command[0]
        if "/" in executable:
            path = Path(executable)
            if not path.exists():
                return False, f"Claude executable not found: {executable}"
            return True, ""

        if shutil.which(executable) is None:
            return False, f"Claude executable `{executable}` is not on PATH"

        return True, ""

    def _write_claude_artifacts(
        self,
        task_id: str,
        command: list[str],
        stdout: str,
        stderr: str,
        exit_code: int,
        success: bool,
        attempts: int,
    ) -> None:
        self.claude_artifact_dir.mkdir(parents=True, exist_ok=True)
        stdout_path = self._claude_stdout_path(task_id)
        stderr_path = self._claude_stderr_path(task_id)
        meta_path = self._claude_meta_path(task_id)

        stdout_path.write_text(stdout or "", encoding="utf-8")
        stderr_path.write_text(stderr or "", encoding="utf-8")
        meta_path.write_text(
            json.dumps(
                {
                    "task_id": task_id,
                    "command": command,
                    "exit_code": exit_code,
                    "success": success,
                    "attempts": attempts,
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        self.add_task_log(
            task_id,
            "info",
            f"Claude artifacts written: stdout={stdout_path}, stderr={stderr_path}, meta={meta_path}",
        )

    def _run_git_capture(self, repo_path: Path, args: list[str]) -> tuple[bool, str]:
        ok, stdout, stderr, _ = self._run_subprocess(["git", *args], repo_path)
        if ok:
            return True, stdout.strip()
        return False, (stderr.strip() or stdout.strip() or "git command failed")

    def _create_execution_branch(self, task: Dict[str, Any], repo_path: Path) -> tuple[bool, str, str]:
        objective = task.get("objective", "task")
        task_id = task.get("id", "task")
        branch_name = choose_branch_name(objective, task_id, [])

        ok, status_short = self._run_git_capture(repo_path, ["status", "--short"])
        if not ok:
            return False, "", f"Unable to get git status: {status_short}"

        ok, current_branch = self._run_git_capture(repo_path, ["branch", "--show-current"])
        if not ok:
            return False, "", f"Unable to detect current branch: {current_branch}"

        self.add_task_log(task_id, "info", f"Execution pre-check current branch: {current_branch}")
        self.add_task_log(task_id, "info", f"Execution pre-check working tree dirty: {bool(status_short)}")

        ok, checkout_output = self._run_git_capture(repo_path, ["checkout", "-b", branch_name])
        if not ok:
            fallback_branch = f"{branch_name}-{task_id[:8]}"
            ok, checkout_output = self._run_git_capture(repo_path, ["checkout", "-b", fallback_branch])
            if not ok:
                return False, "", f"Branch creation failed: {checkout_output}"
            branch_name = fallback_branch

        return True, branch_name, ""

    def _load_repo_profile(self, project_name: str) -> dict[str, Any] | None:
        path = self._profile_path(project_name)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None

    def _load_plan_text(self, task_id: str, fallback_summary: str | None) -> tuple[str, Path]:
        path = self._plan_path(task_id)
        if path.exists():
            return path.read_text(encoding="utf-8"), path
        return (fallback_summary or "No approved plan text available."), path

    def _run_claude_code(
        self,
        task_id: str,
        repo_path: Path,
        prompt_path: Path,
        command_override: str | None = None,
    ) -> tuple[bool, str]:
        effective_command = (command_override or self.claude_code_command or "").strip()

        if not effective_command:
            if self._mock_claude_enabled():
                self.add_task_log(task_id, "warning", "Claude execution mocked in explicit test mode.")
                self.add_task_log(task_id, "info", "Claude command completed successfully (mocked)")
                return True, "mocked"

            message = "Claude execution is required but CLAUDE_CODE_COMMAND is not configured."
            self.add_task_log(task_id, "error", message)
            self._notify(
                f"Mneme task failed: Claude execution is required but not configured.\nOpen: {self.notifier.task_link(task_id)}".strip(),
                task_id=task_id,
                level="error",
            )
            self.mark_task_failed(task_id)
            return False, "failed"

        if not self.anthropic_api_key:
            self.add_task_log(task_id, "warning", "ANTHROPIC_API_KEY is not set; relying on CLI-authenticated Claude session.")

        command = self._build_claude_command(prompt_path, effective_command)
        command_ok, command_error = self._validate_claude_command(command)
        if not command_ok:
            self.add_task_log(task_id, "error", command_error)
            self._notify(
                f"Mneme task failed during Claude preflight.\nReason: {command_error}\nOpen: {self.notifier.task_link(task_id)}".strip(),
                task_id=task_id,
                level="error",
            )
            self.mark_task_failed(task_id)
            return False, "failed"

        self.add_task_log(task_id, "info", f"Running Claude Code command: {' '.join(command)}")
        self.add_task_log(
            task_id,
            "info",
            f"Claude execution policy: retries={self.claude_max_retries}, timeout={self.command_timeout_seconds}s",
        )
        self._notify(f"Mneme started Claude execution.\nOpen: {self.notifier.task_link(task_id)}".strip(), task_id=task_id)

        ok = False
        stdout = ""
        stderr = ""
        code = 1
        attempt = 0
        while attempt < self.claude_max_retries:
            attempt += 1
            ok, stdout, stderr, code = self._run_subprocess(command, repo_path)
            if ok:
                break
            if attempt < self.claude_max_retries:
                self.add_task_log(
                    task_id,
                    "warning",
                    f"Claude attempt {attempt} failed (exit {code}); retrying in {self.claude_retry_delay_seconds}s",
                )
                if self.claude_retry_delay_seconds > 0:
                    time.sleep(self.claude_retry_delay_seconds)

        self._write_claude_artifacts(
            task_id=task_id,
            command=command,
            stdout=stdout,
            stderr=stderr,
            exit_code=code,
            success=ok,
            attempts=attempt,
        )

        if stdout.strip():
            self.add_task_log(task_id, "info", f"Claude stdout: {stdout.strip()[:2000]}")
        if stderr.strip():
            self.add_task_log(task_id, "warning", f"Claude stderr: {stderr.strip()[:2000]}")

        if not ok:
            self.add_task_log(task_id, "error", f"Claude command failed with exit code {code} after {attempt} attempt(s)")
            self._notify(
                f"Mneme task failed during Claude execution.\nReason: exit code {code}\nOpen: {self.notifier.task_link(task_id)}".strip(),
                task_id=task_id,
                level="error",
            )
            self.mark_task_failed(task_id)
            return False, "failed"

        self.add_task_log(task_id, "info", f"Claude command completed successfully (exit code {code}, attempts={attempt})")
        return True, "ok"

    def _run_agent_loop(
        self,
        task: Dict[str, Any],
        repo_path: Path,
        prompt_text: str,
    ) -> tuple[bool, str]:
        """Run the agentic tool-use loop for a task. Falls back to legacy CLI if configured."""
        task_id = task.get("id", "")
        project_provider = task.get("model_provider") or None
        project_model = task.get("model_name") or None

        # Legacy CLI fallback: if CLAUDE_CODE_COMMAND is set AND no provider override, use old path
        project_claude_code_command = task.get("project_claude_code_command")
        if not project_provider and (project_claude_code_command or self.claude_code_command):
            self.add_task_log(task_id, "info", "Using legacy Claude CLI execution path.")
            prompt_path = self._claude_prompt_path(task_id)
            save_markdown(prompt_path, prompt_text)
            return self._run_claude_code(task_id, repo_path, prompt_path, project_claude_code_command)

        # Mock path for tests
        if self._mock_claude_enabled():
            self.add_task_log(task_id, "warning", "Agent execution mocked in test mode.")
            return True, "mocked"

        def log_fn(level: str, message: str) -> None:
            self.add_task_log(task_id, level, message)

        # Orchestration gate: if ENABLE_ORCHESTRATION is set, run 4-phase orchestrated loop
        enable_orchestration = os.getenv("ENABLE_ORCHESTRATION", "false").strip().lower() == "true"
        if enable_orchestration:
            return self._run_orchestrated_agent(task_id, repo_path, prompt_text, log_fn)

        try:
            agent = build_agent_loop(
                project_provider=project_provider,
                project_model=project_model,
                repo_path=repo_path,
                log_fn=log_fn,
                max_iterations=self.agent_max_iterations,
                bash_timeout=self.command_timeout_seconds,
            )
        except (ValueError, RuntimeError) as exc:
            self.add_task_log(task_id, "error", f"Agent setup failed: {exc}")
            self.mark_task_failed(task_id)
            return False, "failed"

        self.add_task_log(task_id, "info", f"Agent loop starting — provider={agent.provider} model={agent.model}")
        self._notify(f"Mneme started agent execution.\nOpen: {self.notifier.task_link(task_id)}".strip(), task_id=task_id)

        success, summary = agent.run(prompt_text)

        if not success:
            self.add_task_log(task_id, "error", f"Agent loop did not complete: {summary}")
            self._notify(
                f"Mneme task failed during agent execution.\nReason: {summary}\nOpen: {self.notifier.task_link(task_id)}".strip(),
                task_id=task_id,
                level="error",
            )
            self.mark_task_failed(task_id)
            return False, "failed"

        self.add_task_log(task_id, "info", f"Agent loop completed: {summary}")
        return True, "ok"

    def _run_orchestrated_agent(
        self,
        task_id: str,
        repo_path: Path,
        prompt_text: str,
        log_fn: Any,
    ) -> tuple[bool, str]:
        """Run the 4-phase orchestrated agent loop via AgentOrchestrator."""
        try:
            from apps.api.app.services.orchestration import AgentOrchestrator  # type: ignore[import]
            from apps.api.app.database import SessionLocal  # type: ignore[import]
        except ImportError as exc:
            self.add_task_log(task_id, "error", f"Orchestration import failed: {exc}")
            self.mark_task_failed(task_id)
            return False, "failed"

        self.add_task_log(task_id, "info", "Starting 4-phase orchestrated agent execution.")
        self._notify(
            f"Mneme started orchestrated execution (4-phase).\nOpen: {self.notifier.task_link(task_id)}".strip(),
            task_id=task_id,
        )

        db = SessionLocal()
        try:
            orchestrator = AgentOrchestrator(task_id=task_id, db=db)
            orchestrator.initialize_workflow()
            final_summary = orchestrator.run_all_phases(repo_path, prompt_text)
            db.commit()
        except Exception as exc:
            db.rollback()
            self.add_task_log(task_id, "error", f"Orchestrated agent failed: {exc}")
            self._notify(
                f"Mneme orchestrated task failed.\nReason: {exc}\nOpen: {self.notifier.task_link(task_id)}".strip(),
                task_id=task_id,
                level="error",
            )
            self.mark_task_failed(task_id)
            return False, "failed"
        finally:
            db.close()

        self.add_task_log(task_id, "info", f"Orchestrated agent completed: {final_summary}")
        return True, "ok"

    def _run_safe_tests(self, task_id: str, repo_path: Path, profile: dict[str, Any]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        commands = profile.get("test_commands", []) or []
        executed_any = False

        for command in commands:
            if not is_safe_test_command(command):
                continue
            executed_any = True
            parts = shlex.split(command)
            ok, stdout, stderr, code = self._run_subprocess(parts, repo_path)
            results.append({"command": command, "success": ok, "exit_code": code})
            self.add_task_log(task_id, "info", f"Test command `{command}` exit code: {code}")
            if stdout.strip():
                self.add_task_log(task_id, "info", f"Test stdout: {stdout.strip()[:1500]}")
            if stderr.strip():
                self.add_task_log(task_id, "warning", f"Test stderr: {stderr.strip()[:1500]}")
            if not ok:
                self._notify(
                    f"Mneme tests failed for task {task_id}.\nCommand: {command}\nOpen: {self.notifier.task_link(task_id)}".strip(),
                    task_id=task_id,
                    level="warning",
                )

        if not executed_any:
            self.add_task_log(task_id, "warning", "No safe test command found in repo profile")

        return results

    def _collect_diff_summary(self, task_id: str, repo_path: Path, branch_name: str, test_results: list[dict[str, Any]]) -> tuple[Path, list[str], str, list[str]]:
        _, status_short = self._run_git_capture(repo_path, ["status", "--short"])
        _, diff_stat = self._run_git_capture(repo_path, ["diff", "--stat"])
        _, diff_name_only = self._run_git_capture(repo_path, ["diff", "--name-only"])
        _, diff_check = self._run_git_capture(repo_path, ["diff", "--check"])

        changed_files = normalize_changed_files(diff_name_only)
        risk_level, risk_notes = classify_changed_file_risk(changed_files)

        diff_summary = generate_diff_summary_markdown(
            task_id=task_id,
            branch_name=branch_name,
            status_short=status_short,
            diff_stat=diff_stat,
            changed_files=changed_files,
            diff_check=diff_check,
            test_results=test_results,
            risk_level=risk_level,
            risk_notes=risk_notes,
        )

        diff_path = self._diff_summary_path(task_id)
        save_markdown(diff_path, diff_summary)
        return diff_path, changed_files, risk_level, risk_notes

    def process_task(self, task: Dict[str, Any]) -> bool:
        """Process a single task."""
        task_id = task['id']
        logger.info("Processing task: %s", task_id)
        logger.info("Objective: %s", task["objective"])

        checkpoint = load_checkpoint()
        if checkpoint and checkpoint.get("task_id") == task_id and checkpoint.get("step") == "plan_created":
            self.add_task_log(task_id, "info", "Recovered checkpoint at plan_created; waiting for approval")
            return True

        # Mark as planning
        if not self.mark_task_planning(task_id):
            return False

        # Add planning log
        self.add_task_log(task_id, "info", "Worker started planning")
        self._notify(
            f"Mneme picked up task for planning.\nOpen: {self.notifier.task_link(task_id)}".strip(),
            task_id=task_id,
        )

        project_name = task.get("project_name") or f"project-{task.get('project_id', 'unknown')}"
        repo_path = task.get("repo_path")

        if not repo_path:
            self.add_task_log(task_id, "error", "Project repo_path is missing")
            self.mark_task_failed(task_id)
            return False

        self.add_task_log(task_id, "info", f"Validating repository path: {repo_path}")
        is_valid_repo, validation_error, resolved_repo_path = validate_repo_path(repo_path)
        if not is_valid_repo or resolved_repo_path is None:
            self.add_task_log(task_id, "error", f"Repository validation failed: {validation_error}")
            self.mark_task_failed(task_id)
            return False

        self.add_task_log(task_id, "info", "Repository validation passed")

        try:
            git_summary = collect_git_summary(resolved_repo_path)
            self._log_git_summary(task_id, git_summary)
        except Exception as exc:
            self.add_task_log(task_id, "error", f"Git summary failed: {exc}")
            self.mark_task_failed(task_id)
            return False

        scan_result = scan_repo(resolved_repo_path)
        self._log_scan_summary(task_id, scan_result)

        profile = build_repo_profile(
            project_name=project_name,
            repo_path=resolved_repo_path,
            git_summary=git_summary,
            scan_result=scan_result,
        )
        profile_path = self._profile_path(project_name)
        save_json(profile_path, profile)
        self.add_task_log(task_id, "info", f"Repo profile generated: {profile_path}")

        plan = generate_plan_markdown(task, profile)
        plan_path = self._plan_path(task_id)
        save_markdown(plan_path, plan)
        self.add_task_log(task_id, "info", f"Implementation plan generated: {plan_path}")
        self._notify(
            f"Mneme plan is ready.\nRisk: {estimate_risk_level(scan_result, profile.get('risk_notes', []))}.\nReview: {self.notifier.task_link(task_id)}".strip(),
            task_id=task_id,
        )

        computed_risk_level = estimate_risk_level(scan_result, profile.get("risk_notes", []))
        plan_details = self._extract_plan_details(plan)
        summary = (
            "Repo-aware planning complete. "
            f"Branch: {git_summary.get('branch', 'unknown')}. "
            f"Dirty: {git_summary.get('is_dirty', False)}. "
            f"Profile: {profile_path}. "
            f"Plan: {plan_path}.\n\n"
            "Plan excerpt:\n"
            f"{self._plan_excerpt(plan)}"
        )

        success = self.create_approval_request(
            task_id,
            title="Approve implementation plan?",
            summary=summary,
            risk_level=computed_risk_level,
            plan_details=plan_details,
        )

        if not success:
            self.add_task_log(task_id, "error", "Failed to create approval request")
            self.mark_task_failed(task_id)
            return False

        self.add_task_log(task_id, "info", "Waiting for plan approval")
        save_checkpoint(
            task_id,
            "plan_created",
            {
                "project_name": project_name,
                "plan_path": str(plan_path),
                "repo_path": str(resolved_repo_path),
            },
        )
        self._notify(
            f"Mneme needs plan approval.\nReview: {self.notifier.task_link(task_id)}".strip(),
            task_id=task_id,
        )
        logger.info("Task %s is now waiting for approval", task_id)
        return True

    def process_execution_task(self, task: Dict[str, Any]) -> bool:
        """Execute a task after plan approval using configured Claude Code command."""
        task_id = task["id"]
        project_name = task.get("project_name") or f"project-{task.get('project_id', 'unknown')}"
        repo_path_raw = task.get("repo_path")
        project_claude_code_command = task.get("project_claude_code_command")
        checkpoint = load_checkpoint()
        resume_context = checkpoint.get("context", {}) if checkpoint and checkpoint.get("task_id") == task_id else {}
        resume_step = checkpoint.get("step") if checkpoint and checkpoint.get("task_id") == task_id else None

        self.add_task_log(task_id, "info", "Worker started approval-gated execution")
        if resume_step in {"approved", "executing"}:
            self.add_task_log(task_id, "info", f"Recovered checkpoint at step: {resume_step}")
        else:
            self.update_task_status(task_id, "approved_for_execution")
            save_checkpoint(task_id, "approved", {"project_name": project_name})

        if not repo_path_raw:
            self.add_task_log(task_id, "error", "Execution failed: missing repo_path")
            self.mark_task_failed(task_id)
            return False

        valid, error_text, repo_path = validate_repo_path(repo_path_raw)
        if not valid or repo_path is None:
            self.add_task_log(task_id, "error", f"Execution failed repository validation: {error_text}")
            self.mark_task_failed(task_id)
            return False

        branch_name = resume_context.get("branch_name") if resume_step == "executing" else None
        if not branch_name:
            ok, branch_name, branch_error = self._create_execution_branch(task, repo_path)
            if not ok:
                self.add_task_log(task_id, "error", branch_error)
                self.mark_task_failed(task_id)
                return False

            self.set_task_branch(task_id, branch_name)
            self.add_task_log(task_id, "info", f"Execution branch created: {branch_name}")

        self.update_task_status(task_id, "executing")
        save_checkpoint(
            task_id,
            "executing",
            {
                "project_name": project_name,
                "branch_name": branch_name,
            },
        )

        profile = self._load_repo_profile(project_name)
        if not profile:
            self.add_task_log(task_id, "error", "Repo profile not found; cannot continue execution")
            self.mark_task_failed(task_id)
            return False

        approved_plan_text, approved_plan_path = self._load_plan_text(task_id, task.get("approved_plan_summary"))
        prompt_text = generate_claude_prompt_markdown(
            task=task,
            profile=profile,
            approved_plan_text=approved_plan_text,
            approved_plan_path=str(approved_plan_path),
            likely_files=profile.get("important_files", []),
            test_commands=profile.get("test_commands", []),
        )
        # Save prompt for audit / legacy CLI fallback
        prompt_path = self._claude_prompt_path(task_id)
        save_markdown(prompt_path, prompt_text)
        self.add_task_log(task_id, "info", f"Claude prompt generated: {prompt_path}")

        agent_ok, _agent_state = self._run_agent_loop(task, repo_path, prompt_text)
        if not agent_ok:
            return False

        test_results = self._run_safe_tests(task_id, repo_path, profile)

        diff_path, changed_files, risk_level, risk_notes = self._collect_diff_summary(
            task_id=task_id,
            repo_path=repo_path,
            branch_name=branch_name,
            test_results=test_results,
        )
        self.add_task_log(task_id, "info", f"Diff summary generated: {diff_path}")
        self.add_task_log(task_id, "info", f"Changed files: {', '.join(changed_files) if changed_files else 'none'}")
        tests_passed = all(result.get("success", False) for result in test_results) if test_results else False
        tests_state = "pass" if tests_passed else "fail" if test_results else "not run"
        self._notify(
            (
                f"Mneme generated changes.\n"
                f"Changed files: {len(changed_files)}\n"
                f"Tests: {tests_state}\n"
                f"Review: {self.notifier.task_link(task_id)}"
            ).strip(),
            task_id=task_id,
        )

        approval_summary = (
            f"Diff review for branch `{branch_name}`.\n"
            f"Diff summary path: {diff_path}\n"
            f"Changed files ({len(changed_files)}): {', '.join(changed_files) if changed_files else 'none'}\n"
            f"Tests passed: {tests_passed}\n"
            "Risk notes:\n"
            + "\n".join(f"- {note}" for note in risk_notes)
        )

        created = self.create_approval_request(
            task_id=task_id,
            title="Review generated changes?",
            summary=approval_summary,
            risk_level=risk_level,
            approval_type="diff_review",
        )
        if not created:
            self.add_task_log(task_id, "error", "Failed to create diff review approval")
            self.mark_task_failed(task_id)
            return False

        self.add_task_log(task_id, "info", "Waiting for diff review approval")
        self._notify(
            f"Mneme needs diff review approval.\nReview: {self.notifier.task_link(task_id)}".strip(),
            task_id=task_id,
        )
        clear_checkpoint()
        return True

    def _process_task_batch(
        self,
        tasks: list[Dict[str, Any]],
        handler: Callable[[Dict[str, Any]], bool],
        batch_name: str,
    ) -> None:
        for task in tasks:
            try:
                handler(task)
            except Exception as exc:
                logger.exception(
                    "Exception in %s batch for task %s: %s",
                    batch_name,
                    task.get("id"),
                    exc,
                )

    def run(self, heartbeat_interval: int = 30):
        """Main worker loop."""
        logger.info("Mneme Worker started")
        logger.info("Worker ID: %s", self.worker_id)
        logger.info("Hostname: %s", self.hostname)
        logger.info("API URL: %s", self.api_url)
        logger.info("Heartbeat interval: %ds", heartbeat_interval)

        if not self._online_notified:
            self._notify("Mneme worker is online.")
            self._online_notified = True

        last_heartbeat_time = time.time()

        try:
            while self.running:
                current_time = time.time()

                # Send heartbeat
                if current_time - last_heartbeat_time >= heartbeat_interval:
                    if not self.heartbeat():
                        logger.warning("Failed to send heartbeat")
                    last_heartbeat_time = current_time

                queued_tasks = self.get_queued_tasks()
                self._process_task_batch(queued_tasks, self.process_task, "planning")

                execution_tasks = self.get_execution_ready_tasks()
                self._process_task_batch(execution_tasks, self.process_execution_task, "execution")

                # Sleep briefly before next check
                time.sleep(5)

        except KeyboardInterrupt:
            logger.info("Worker shutting down...")
            self.running = False
        except Exception as e:
            logger.exception("Unexpected error: %s", e)


def main():
    api_url = os.getenv("MNEME_API_URL", "http://localhost:8000")
    worker_id = os.getenv("MNEME_WORKER_ID", None)
    heartbeat_interval = int(os.getenv("MNEME_HEARTBEAT_INTERVAL", "30"))

    worker = MnemeWorker(api_url, worker_id)
    worker.run(heartbeat_interval=heartbeat_interval)


if __name__ == "__main__":
    main()
