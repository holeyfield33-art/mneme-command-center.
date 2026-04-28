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
import json
from datetime import datetime
from typing import Dict, Any, Optional


class MnemeWorker:
    def __init__(self, api_url: str, worker_id: Optional[str] = None):
        self.api_url = api_url.rstrip('/')
        self.worker_id = worker_id or str(uuid.uuid4())
        self.hostname = socket.gethostname()
        self.last_heartbeat = None
        self.running = True
        
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

    def create_approval_request(self, task_id: str, title: str, summary: str) -> bool:
        """Create an approval request for a task."""
        try:
            response = requests.post(
                f"{self.api_url}/worker/tasks/{task_id}/approval-request",
                params={
                    "title": title,
                    "summary": summary
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

    def generate_implementation_plan(self, task: Dict[str, Any]) -> str:
        """Generate a mock implementation plan for the task."""
        plan = f"""
IMPLEMENTATION PLAN
===================

Task: {task['objective']}
Project ID: {task['project_id']}
Mode: {task['mode']}
Risk Level: {task['risk_level']}

Plan Generated: {datetime.now().isoformat()}

Steps:
1. Analyze the objective and requirements
2. Identify the specific files that need to be modified
3. Create a comprehensive implementation strategy
4. Generate code changes
5. Validate changes against requirements
6. Prepare for execution

Status: Waiting for approval

This is a Phase 1 mock plan. The actual implementation will be enabled in Phase 2.
        """
        return plan.strip()

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

        # Simulate planning work
        print(f"[INFO] Generating implementation plan...")
        time.sleep(1)  # Simulate work

        # Generate plan
        plan = self.generate_implementation_plan(task)
        self.add_task_log(task_id, "info", f"Implementation plan generated ({len(plan)} chars)")

        # Create approval request
        success = self.create_approval_request(
            task_id,
            title="Implementation Plan Review",
            summary=plan
        )

        if success:
            self.add_task_log(task_id, "info", "Waiting for plan approval")
            print(f"[INFO] Task {task_id} is now waiting for approval")
            return True
        else:
            self.add_task_log(task_id, "error", "Failed to create approval request")
            return False

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
