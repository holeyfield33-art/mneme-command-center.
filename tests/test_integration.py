"""Pytest-based test suite for Mneme Command Center.

By default, only local non-live tests run.
Enable live API integration checks with:
    MNEME_RUN_LIVE_TESTS=1 /home/codespace/.python/current/bin/python -m pytest -v
"""

import json
import os
import time
from dataclasses import dataclass
from typing import Any
from urllib import error, parse, request

import pytest

RUN_LIVE_ENV = "MNEME_RUN_LIVE_TESTS"
RUN_WORKER_ENV = "MNEME_RUN_WORKER_TESTS"
DEFAULT_API_URL = "http://localhost:8000"
DEFAULT_PASSWORD = "admin"


@dataclass
class ApiResponse:
    status_code: int
    body: str
    data: Any


class ApiClient:
    def __init__(self, base_url: str, token: str | None = None, timeout: int = 8):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def request(
        self,
        method: str,
        endpoint: str,
        *,
        data: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        token: str | None = None,
    ) -> ApiResponse:
        query = f"?{parse.urlencode(params)}" if params else ""
        url = f"{self.base_url}{endpoint}{query}"

        headers: dict[str, str] = {}
        effective_token = self.token if token is None else token
        if effective_token:
            headers["Authorization"] = f"Bearer {effective_token}"

        payload = None
        if data is not None:
            payload = json.dumps(data).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = request.Request(url=url, data=payload, headers=headers, method=method)

        try:
            with request.urlopen(req, timeout=self.timeout) as response:
                body = response.read().decode("utf-8")
                return ApiResponse(response.status, body, _maybe_json(body))
        except error.HTTPError as exc:
            body = exc.read().decode("utf-8")
            return ApiResponse(exc.code, body, _maybe_json(body))


def _maybe_json(body: str) -> Any:
    if not body:
        return None
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return None


def _require_live_mode() -> None:
    if os.getenv(RUN_LIVE_ENV) != "1":
        pytest.skip(
            f"Live integration tests are disabled. Set {RUN_LIVE_ENV}=1 to run them."
        )


def _require_worker_mode() -> None:
    if os.getenv(RUN_WORKER_ENV) != "1":
        pytest.skip(
            f"Worker-specific tests are disabled. Set {RUN_WORKER_ENV}=1 to run them."
        )


def _assert_status(response: ApiResponse, expected: int) -> None:
    assert response.status_code == expected, (
        f"Expected {expected}, got {response.status_code}. Body: {response.body}"
    )


@pytest.fixture(scope="session")
def live_config() -> dict[str, str]:
    _require_live_mode()
    return {
        "api_url": os.getenv("MNEME_API_URL", DEFAULT_API_URL),
        "password": os.getenv("MNEME_ADMIN_PASSWORD", DEFAULT_PASSWORD),
    }


@pytest.fixture(scope="session")
def live_api(live_config: dict[str, str]) -> ApiClient:
    client = ApiClient(base_url=live_config["api_url"])

    health = client.request("GET", "/health")
    if health.status_code != 200:
        pytest.skip(
            f"Live API not reachable at {live_config['api_url']} (status {health.status_code})."
        )

    login = client.request("POST", "/auth/login", data={"password": live_config["password"]})
    if login.status_code != 200:
        pytest.fail(
            "Live API is up but login failed. "
            "Set MNEME_ADMIN_PASSWORD to the running server password. "
            f"Status: {login.status_code}, body: {login.body}"
        )

    token = (login.data or {}).get("access_token")
    assert token, "Login response did not include access_token"

    return ApiClient(base_url=live_config["api_url"], token=token)


@pytest.fixture(scope="session")
def live_entities(live_api: ApiClient) -> dict[str, str]:
    project = live_api.request(
        "POST",
        "/projects",
        data={
            "name": f"test-project-{int(time.time())}",
            "repo_path": "/tmp/test-repo",
            "repo_url": "https://github.com/test/repo",
            "default_branch": "main",
        },
    )
    _assert_status(project, 200)

    project_id = (project.data or {}).get("id")
    assert project_id, "Project response missing id"

    task = live_api.request(
        "POST",
        "/tasks",
        data={
            "project_id": project_id,
            "objective": "Test task objective",
            "mode": "interactive",
            "risk_level": "medium",
        },
    )
    _assert_status(task, 200)

    task_id = (task.data or {}).get("id")
    assert task_id, "Task response missing id"

    return {"project_id": project_id, "task_id": task_id}


def test_pytest_discovery_sanity() -> None:
    """Always-run test that guarantees pytest discovers at least one test."""
    assert (2 + 2) == 4


class TestMnemeIntegration:
    @pytest.mark.live
    def test_login_with_correct_password(self, live_config: dict[str, str]) -> None:
        client = ApiClient(base_url=live_config["api_url"])
        response = client.request(
            "POST", "/auth/login", data={"password": live_config["password"]}
        )
        _assert_status(response, 200)
        assert "access_token" in (response.data or {})

    @pytest.mark.live
    def test_login_rejects_wrong_password(self, live_config: dict[str, str]) -> None:
        client = ApiClient(base_url=live_config["api_url"])
        response = client.request("POST", "/auth/login", data={"password": "wrong"})
        _assert_status(response, 401)

    @pytest.mark.live
    def test_list_projects(self, live_api: ApiClient) -> None:
        response = live_api.request("GET", "/projects")
        _assert_status(response, 200)
        assert isinstance(response.data, list)

    @pytest.mark.live
    def test_get_project(self, live_api: ApiClient, live_entities: dict[str, str]) -> None:
        response = live_api.request("GET", f"/projects/{live_entities['project_id']}")
        _assert_status(response, 200)
        assert (response.data or {}).get("id") == live_entities["project_id"]

    @pytest.mark.live
    def test_list_tasks(self, live_api: ApiClient) -> None:
        response = live_api.request("GET", "/tasks")
        _assert_status(response, 200)
        assert isinstance(response.data, list)

    @pytest.mark.live
    def test_get_task(self, live_api: ApiClient, live_entities: dict[str, str]) -> None:
        response = live_api.request("GET", f"/tasks/{live_entities['task_id']}")
        _assert_status(response, 200)
        assert (response.data or {}).get("id") == live_entities["task_id"]

    @pytest.mark.live
    def test_add_task_log(self, live_api: ApiClient, live_entities: dict[str, str]) -> None:
        response = live_api.request(
            "POST",
            f"/tasks/{live_entities['task_id']}/logs",
            data={"level": "info", "message": "Test log message"},
        )
        _assert_status(response, 200)
        assert (response.data or {}).get("message") == "Test log message"

    @pytest.mark.live
    def test_list_task_logs(self, live_api: ApiClient, live_entities: dict[str, str]) -> None:
        response = live_api.request("GET", f"/tasks/{live_entities['task_id']}/logs")
        _assert_status(response, 200)
        assert isinstance(response.data, list)

    @pytest.mark.live
    def test_create_and_approve_request(
        self, live_api: ApiClient, live_entities: dict[str, str]
    ) -> None:
        planning = live_api.request("PUT", f"/worker/tasks/{live_entities['task_id']}/planning")
        _assert_status(planning, 200)

        created = live_api.request(
            "POST",
            f"/worker/tasks/{live_entities['task_id']}/approval-request",
            params={"title": "Test Plan Review", "summary": "Test implementation plan"},
        )
        _assert_status(created, 200)
        approval_id = (created.data or {}).get("id")
        assert approval_id, "Approval response missing id"

        approvals = live_api.request("GET", "/approvals", params={"status": "pending"})
        _assert_status(approvals, 200)
        assert isinstance(approvals.data, list)

        approved = live_api.request("POST", f"/approvals/{approval_id}/approve")
        _assert_status(approved, 200)
        assert (approved.data or {}).get("status") == "approved"

    @pytest.mark.live
    def test_emergency_stop_cycle(self, live_api: ApiClient) -> None:
        stop = live_api.request("POST", "/system/emergency-stop")
        _assert_status(stop, 200)

        status = live_api.request("GET", "/system/emergency-stop/status")
        _assert_status(status, 200)
        assert (status.data or {}).get("active") is True

        clear = live_api.request("POST", "/system/emergency-stop/clear")
        _assert_status(clear, 200)

    @pytest.mark.live
    def test_worker_heartbeat_and_status(self, live_api: ApiClient) -> None:
        _require_worker_mode()
        heartbeat = live_api.request(
            "POST",
            "/worker/heartbeat",
            data={"worker_id": "pytest-worker", "hostname": "pytest-host"},
        )
        _assert_status(heartbeat, 200)

        status = live_api.request("GET", "/worker/status")
        _assert_status(status, 200)
        assert isinstance(status.data, list)

    @pytest.mark.live
    def test_dashboard_dependent_checks_are_skipped(self) -> None:
        pytest.skip(
            "Dashboard integration checks require a running UI harness and are not part of default pytest runs."
        )
