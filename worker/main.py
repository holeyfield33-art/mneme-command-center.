#!/usr/bin/env python3
"""
Mneme Worker - Polls for tasks and creates approval requests.
Runs locally to process tasks from the API.
"""

import os
import sys
import time
import uuid
import json
import requests
import socket
import shlex
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

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


class MnemeWorker:
    def __init__(self, api_url: str, worker_id: Optional[str] = None):
        self.api_url = api_url.rstrip('/')
        self.worker_id = worker_id or str(uuid.uuid4())
        self.hostname = socket.gethostname()
        self.last_heartbeat = None
        self.running = True
        self.workspace_root = Path(__file__).resolve().parents[1]
        self.claude_code_command = os.getenv("CLAUDE_CODE_COMMAND", "").strip()
        self.command_timeout_seconds = int(os.getenv("MNEME_COMMAND_TIMEOUT", "900"))
        
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
                    print("[WARN] Emergency stop is active. Will not process tasks.")
                    return False
                print(f"[{self.last_heartbeat.isoformat()}] Heartbeat sent")
                return True
            else:
                print(f"[ERROR] Heartbeat failed: {response.status_code}")
                return False
        except requests.RequestException as e:
            print(f"[ERROR] Heartbeat error: {e}")
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
                print(f"[INFO] Found {len(tasks)} queued tasks")
                return tasks
            else:
                print(f"[ERROR] Failed to get tasks: {response.status_code}")
                return []
        except requests.RequestException as e:
            print(f"[ERROR] Error getting tasks: {e}")
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
                print(f"[INFO] Found {len(tasks)} execution-ready tasks")
                return tasks
            print(f"[ERROR] Failed to get execution tasks: {response.status_code}")
            return []
        except requests.RequestException as e:
            print(f"[ERROR] Error getting execution tasks: {e}")
            return []

    def mark_task_planning(self, task_id: str) -> bool:
        """Mark task as planning."""
        try:
            response = requests.put(
                f"{self.api_url}/worker/tasks/{task_id}/planning",
                timeout=5
            )
            if response.status_code == 200:
                print(f"[INFO] Task {task_id} marked as planning")
                return True
            else:
                print(f"[ERROR] Failed to mark task as planning: {response.status_code}")
                return False
        except requests.RequestException as e:
            print(f"[ERROR] Error marking task as planning: {e}")
            return False

    def mark_task_failed(self, task_id: str) -> bool:
        """Mark task as failed."""
        try:
            response = requests.put(
                f"{self.api_url}/worker/tasks/{task_id}/failed",
                timeout=5
            )
            if response.status_code == 200:
                print(f"[INFO] Task {task_id} marked as failed")
                return True
            print(f"[ERROR] Failed to mark task as failed: {response.status_code}")
            return False
        except requests.RequestException as e:
            print(f"[ERROR] Error marking task as failed: {e}")
            return False

    def update_task_status(self, task_id: str, new_status: str) -> bool:
        """Set task status from worker route."""
        try:
            response = requests.put(
                f"{self.api_url}/worker/tasks/{task_id}/status",
                params={"new_status": new_status},
                timeout=5,
            )
            return response.status_code == 200
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
                print(f"[LOG] [{level.upper()}] {message}")
                return True
            else:
                print(f"[ERROR] Failed to add log: {response.status_code}")
                return False
        except requests.RequestException as e:
            print(f"[ERROR] Error adding log: {e}")
            return False

    def create_approval_request(
        self,
        task_id: str,
        title: str,
        summary: str,
        risk_level: str,
        approval_type: str = "plan",
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
                },
                timeout=5
            )
            if response.status_code == 200:
                print(f"[INFO] Approval request created for task {task_id}")
                return True
            else:
                print(f"[ERROR] Failed to create approval request: {response.status_code}")
                return False
        except requests.RequestException as e:
            print(f"[ERROR] Error creating approval request: {e}")
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

    def _plan_excerpt(self, plan_markdown: str, max_chars: int = 500) -> str:
        if len(plan_markdown) <= max_chars:
            return plan_markdown
        return plan_markdown[:max_chars].rstrip() + "\n..."

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

    def _run_claude_code(self, task_id: str, repo_path: Path, prompt_path: Path) -> tuple[bool, str]:
        if not self.claude_code_command:
            self.add_task_log(
                task_id,
                "warning",
                "CLAUDE_CODE_COMMAND is not configured. Task moved to waiting_for_manual_execution.",
            )
            self.update_task_status(task_id, "waiting_for_manual_execution")
            return False, "disabled"

        command_parts = shlex.split(self.claude_code_command)
        command = [*command_parts, str(prompt_path)]
        self.add_task_log(task_id, "info", f"Running Claude Code command: {' '.join(command)}")

        ok, stdout, stderr, code = self._run_subprocess(command, repo_path)
        if stdout.strip():
            self.add_task_log(task_id, "info", f"Claude stdout: {stdout.strip()[:2000]}")
        if stderr.strip():
            self.add_task_log(task_id, "warning", f"Claude stderr: {stderr.strip()[:2000]}")

        if not ok:
            self.add_task_log(task_id, "error", f"Claude command failed with exit code {code}")
            self.mark_task_failed(task_id)
            return False, "failed"

        self.add_task_log(task_id, "info", "Claude command completed successfully")
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
        print(f"\n[INFO] Processing task: {task_id}")
        print(f"[INFO] Objective: {task['objective']}")

        # Mark as planning
        if not self.mark_task_planning(task_id):
            return False

        # Add planning log
        self.add_task_log(task_id, "info", "Worker started planning")

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

        computed_risk_level = estimate_risk_level(scan_result, profile.get("risk_notes", []))
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
        )

        if not success:
            self.add_task_log(task_id, "error", "Failed to create approval request")
            self.mark_task_failed(task_id)
            return False

        self.add_task_log(task_id, "info", "Waiting for plan approval")
        print(f"[INFO] Task {task_id} is now waiting for approval")
        return True

    def process_execution_task(self, task: Dict[str, Any]) -> bool:
        """Execute a task after plan approval using configured Claude Code command."""
        task_id = task["id"]
        project_name = task.get("project_name") or f"project-{task.get('project_id', 'unknown')}"
        repo_path_raw = task.get("repo_path")

        self.add_task_log(task_id, "info", "Worker started approval-gated execution")
        self.update_task_status(task_id, "approved_for_execution")

        if not repo_path_raw:
            self.add_task_log(task_id, "error", "Execution failed: missing repo_path")
            self.mark_task_failed(task_id)
            return False

        valid, error_text, repo_path = validate_repo_path(repo_path_raw)
        if not valid or repo_path is None:
            self.add_task_log(task_id, "error", f"Execution failed repository validation: {error_text}")
            self.mark_task_failed(task_id)
            return False

        ok, branch_name, branch_error = self._create_execution_branch(task, repo_path)
        if not ok:
            self.add_task_log(task_id, "error", branch_error)
            self.mark_task_failed(task_id)
            return False

        self.set_task_branch(task_id, branch_name)
        self.add_task_log(task_id, "info", f"Execution branch created: {branch_name}")
        self.update_task_status(task_id, "executing")

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
        prompt_path = self._claude_prompt_path(task_id)
        save_markdown(prompt_path, prompt_text)
        self.add_task_log(task_id, "info", f"Claude prompt generated: {prompt_path}")

        claude_ok, claude_state = self._run_claude_code(task_id, repo_path, prompt_path)
        if not claude_ok:
            # Disabled path is a clean pause; failed path has already marked task failed.
            return claude_state == "disabled"

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
        return True

    def run(self, heartbeat_interval: int = 30):
        """Main worker loop."""
        print(f"[INFO] Mneme Worker started")
        print(f"[INFO] Worker ID: {self.worker_id}")
        print(f"[INFO] Hostname: {self.hostname}")
        print(f"[INFO] API URL: {self.api_url}")
        print(f"[INFO] Heartbeat interval: {heartbeat_interval}s")
        print("-" * 60)

        last_heartbeat_time = time.time()

        try:
            while self.running:
                current_time = time.time()

                # Send heartbeat
                if current_time - last_heartbeat_time >= heartbeat_interval:
                    if not self.heartbeat():
                        print("[WARN] Failed to send heartbeat")
                    last_heartbeat_time = current_time

                # Get and process tasks
                tasks = self.get_queued_tasks()
                for task in tasks:
                    try:
                        self.process_task(task)
                    except Exception as e:
                        print(f"[ERROR] Exception processing task: {e}")
                        import traceback
                        traceback.print_exc()

                execution_tasks = self.get_execution_ready_tasks()
                for task in execution_tasks:
                    try:
                        self.process_execution_task(task)
                    except Exception as e:
                        print(f"[ERROR] Exception executing task: {e}")
                        import traceback
                        traceback.print_exc()

                # Sleep briefly before next check
                time.sleep(5)

        except KeyboardInterrupt:
            print("\n[INFO] Worker shutting down...")
            self.running = False
        except Exception as e:
            print(f"\n[ERROR] Unexpected error: {e}")
            import traceback
            traceback.print_exc()


def main():
    api_url = os.getenv("MNEME_API_URL", "http://localhost:8000")
    worker_id = os.getenv("MNEME_WORKER_ID", None)
    heartbeat_interval = int(os.getenv("MNEME_HEARTBEAT_INTERVAL", "30"))

    worker = MnemeWorker(api_url, worker_id)
    worker.run(heartbeat_interval=heartbeat_interval)


if __name__ == "__main__":
    main()
