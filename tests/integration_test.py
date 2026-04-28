#!/usr/bin/env python3
"""
Integration test for Mneme Command Center Phase 1
Verifies all major workflows are working
"""

import requests
import json
import time
import sys
from typing import Dict, Any

class MnemeTest:
    def __init__(self, api_url: str = "http://localhost:8000", password: str = "admin"):
        self.api_url = api_url
        self.password = password
        self.token = None
        self.project_id = None
        self.task_id = None
        self.passed = 0
        self.failed = 0

    def test(self, name: str, fn):
        """Run a test function."""
        try:
            fn()
            print(f"✓ {name}")
            self.passed += 1
        except AssertionError as e:
            print(f"✗ {name}: {e}")
            self.failed += 1
        except Exception as e:
            print(f"✗ {name}: {type(e).__name__}: {e}")
            self.failed += 1

    def api_request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """Make an API request."""
        url = f"{self.api_url}{endpoint}"
        headers = kwargs.pop("headers", {})
        
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        
        response = requests.request(method, url, headers=headers, **kwargs)
        return response

    def run_all_tests(self):
        """Run all tests."""
        print("Mneme Command Center - Integration Tests\n")
        print("=" * 60)

        # Health check
        self.test("API is healthy", lambda: (
            self.api_request("GET", "/health").status_code == 200
        ))

        # Auth
        self.test("Login with correct password", self.test_login)
        self.test("Login rejects wrong password", self.test_login_invalid)

        # Projects
        self.test("Create project", self.test_create_project)
        self.test("List projects", self.test_list_projects)
        self.test("Get project", self.test_get_project)

        # Tasks
        self.test("Create task in project", self.test_create_task)
        self.test("List tasks", self.test_list_tasks)
        self.test("Get task", self.test_get_task)

        # Logs
        self.test("Add task log", self.test_add_log)
        self.test("List task logs", self.test_list_logs)

        # Approvals
        self.test("Create approval request", self.test_create_approval)
        self.test("List pending approvals", self.test_list_approvals)
        self.test("Approve request", self.test_approve)

        # Worker
        self.test("Worker heartbeat", self.test_worker_heartbeat)
        self.test("Get worker status", self.test_get_worker_status)

        # System
        self.test("Activate emergency stop", self.test_emergency_stop)
        self.test("Get emergency stop status", self.test_emergency_stop_status)
        self.test("Clear emergency stop", self.test_clear_emergency_stop)

        print("=" * 60)
        print(f"\nResults: {self.passed} passed, {self.failed} failed\n")

        return self.failed == 0

    def test_login(self):
        """Test login with correct password."""
        response = self.api_request("POST", "/auth/login", json={"password": self.password})
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert "access_token" in data
        self.token = data["access_token"]

    def test_login_invalid(self):
        """Test login with wrong password."""
        response = self.api_request("POST", "/auth/login", json={"password": "wrong"})
        assert response.status_code == 401, f"Status: {response.status_code}"

    def test_create_project(self):
        """Test creating a project."""
        response = self.api_request("POST", "/projects", json={
            "name": f"test-project-{int(time.time())}",
            "repo_path": "/tmp/test-repo",
            "repo_url": "https://github.com/test/repo",
            "default_branch": "main"
        })
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        self.project_id = data["id"]
        assert data["name"]
        assert data["status"] == "active"

    def test_list_projects(self):
        """Test listing projects."""
        response = self.api_request("GET", "/projects")
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert isinstance(data, list)

    def test_get_project(self):
        """Test getting a project."""
        response = self.api_request("GET", f"/projects/{self.project_id}")
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert data["id"] == self.project_id

    def test_create_task(self):
        """Test creating a task."""
        response = self.api_request("POST", "/tasks", json={
            "project_id": self.project_id,
            "objective": "Test task objective",
            "mode": "interactive",
            "risk_level": "medium"
        })
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        self.task_id = data["id"]
        assert data["status"] == "queued"
        assert data["objective"] == "Test task objective"

    def test_list_tasks(self):
        """Test listing tasks."""
        response = self.api_request("GET", "/tasks")
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert isinstance(data, list)

    def test_get_task(self):
        """Test getting a task."""
        response = self.api_request("GET", f"/tasks/{self.task_id}")
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert data["id"] == self.task_id

    def test_add_log(self):
        """Test adding a task log."""
        response = self.api_request("POST", f"/tasks/{self.task_id}/logs", json={
            "level": "info",
            "message": "Test log message"
        })
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert data["message"] == "Test log message"
        assert data["level"] == "info"

    def test_list_logs(self):
        """Test listing task logs."""
        response = self.api_request("GET", f"/tasks/{self.task_id}/logs")
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_create_approval(self):
        """Test creating an approval request."""
        # First mark task as planning
        self.api_request("PUT", f"/worker/tasks/{self.task_id}/planning")
        
        response = self.api_request("POST", f"/worker/tasks/{self.task_id}/approval-request",
            params={
                "title": "Test Plan Review",
                "summary": "This is a test implementation plan"
            }
        )
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert data["title"] == "Test Plan Review"
        assert data["status"] == "pending"
        self.approval_id = data["id"]

    def test_list_approvals(self):
        """Test listing pending approvals."""
        response = self.api_request("GET", "/approvals?status=pending")
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert isinstance(data, list)

    def test_approve(self):
        """Test approving an approval."""
        response = self.api_request("POST", f"/approvals/{self.approval_id}/approve")
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert data["status"] == "approved"

    def test_worker_heartbeat(self):
        """Test worker heartbeat."""
        response = self.api_request("POST", "/worker/heartbeat", json={
            "worker_id": "test-worker",
            "hostname": "test-machine"
        })
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert data["status"] == "ok"

    def test_get_worker_status(self):
        """Test getting worker status."""
        response = self.api_request("GET", "/worker/status")
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert isinstance(data, list)

    def test_emergency_stop(self):
        """Test activating emergency stop."""
        response = self.api_request("POST", "/system/emergency-stop")
        assert response.status_code == 200, f"Status: {response.status_code}"

    def test_emergency_stop_status(self):
        """Test getting emergency stop status."""
        response = self.api_request("GET", "/system/emergency-stop/status")
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert data["active"] == True

    def test_clear_emergency_stop(self):
        """Test clearing emergency stop."""
        response = self.api_request("POST", "/system/emergency-stop/clear")
        assert response.status_code == 200, f"Status: {response.status_code}"


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Mneme Integration Tests")
    parser.add_argument("--api-url", default="http://localhost:8000", help="API URL")
    parser.add_argument("--password", default="admin", help="Admin password")
    args = parser.parse_args()

    tester = MnemeTest(args.api_url, args.password)
    success = tester.run_all_tests()

    sys.exit(0 if success else 1)
