from pathlib import Path


def _read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def test_frontend_auth_endpoints_exist_in_backend_routes() -> None:
    api_js = _read("apps/dashboard/src/api.js")
    auth_routes = _read("apps/api/app/routes/auth.py")

    assert "/auth/login" in api_js
    assert "/auth/google-login" in api_js
    assert "/auth/mobile-exchange" in api_js

    assert '@router.post("/login"' in auth_routes
    assert '@router.post("/google-login"' in auth_routes
    assert '@router.post("/mobile-exchange"' in auth_routes


def test_orchestration_client_endpoints_exist_in_backend_routes() -> None:
    api_js = _read("apps/dashboard/src/api.js")
    orchestration_routes = _read("apps/api/app/routes/orchestration.py")

    expected_client_paths = [
        "/api/v1/tasks/${id}/orchestration/initialize",
        "/api/v1/tasks/${id}/orchestration/phases",
        "/api/v1/tasks/${id}/orchestration/status",
        "/api/v1/tasks/${id}/orchestration/log",
        "/api/v1/tasks/${id}/orchestration/checkpoints",
        "/api/v1/tasks/${id}/orchestration/rollback",
        "/api/v1/tasks/${id}/orchestration/resume",
        "/api/v1/tasks/${id}/orchestration/phases/${phaseType}/complete",
        "/api/v1/tasks/${id}/orchestration/phases/${phaseType}/fail",
    ]
    for path in expected_client_paths:
        assert path in api_js

    expected_backend_fragments = [
        '@router.post("/{task_id}/orchestration/initialize"',
        '@router.get("/{task_id}/orchestration/phases"',
        '@router.get("/{task_id}/orchestration/status"',
        '@router.get("/{task_id}/orchestration/log"',
        '@router.get("/{task_id}/orchestration/checkpoints"',
        '@router.post("/{task_id}/orchestration/rollback"',
        '@router.post("/{task_id}/orchestration/resume"',
        '@router.post("/{task_id}/orchestration/phases/{phase_type}/complete"',
        '@router.post("/{task_id}/orchestration/phases/{phase_type}/fail"',
    ]
    for fragment in expected_backend_fragments:
        assert fragment in orchestration_routes
