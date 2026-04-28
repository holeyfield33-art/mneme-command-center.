#!/usr/bin/env python3
"""
Mneme Worker - Polls for tasks and creates approval requests.
Runs locally to process tasks from the API.
"""

import os
import sys
import time
import uuid
import requests
import socket
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

from worker.repo_planning import (
    build_repo_profile,
    collect_git_summary,
    estimate_risk_level,
    generate_plan_markdown,
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

    def add_task_log(self, task_id: str, level: str, message: str) -> bool:
        """Add a log to a task."""
        try:
            response = requests.post(
                f"{self.api_url}/tasks/{task_id}/logs",
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

    def create_approval_request(self, task_id: str, title: str, summary: str, risk_level: str) -> bool:
        """Create an approval request for a task."""
        try:
            response = requests.post(
                f"{self.api_url}/worker/tasks/{task_id}/approval-request",
                params={
                    "title": title,
                    "summary": summary,
                    "risk_level": risk_level,
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
