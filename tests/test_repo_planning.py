from pathlib import Path

from worker.repo_planning import (
    build_repo_profile,
    collect_git_summary,
    generate_plan_markdown,
    scan_repo,
    slugify_project_name,
    validate_repo_path,
)


def test_slugify_project_name() -> None:
    assert slugify_project_name("My Fancy Project") == "my-fancy-project"


def test_validate_repo_path_invalid_when_missing(tmp_path: Path) -> None:
    missing = tmp_path / "missing-repo"
    is_valid, error, resolved = validate_repo_path(str(missing))

    assert is_valid is False
    assert "does not exist" in (error or "")
    assert resolved is None


def test_validate_repo_path_valid_repo_with_mocked_git(tmp_path: Path, monkeypatch) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / ".git").mkdir()

    def fake_run_git_command(repo_path: Path, command_key: str):
        assert repo_path == repo
        assert command_key == "status_short"
        return True, ""

    monkeypatch.setattr("worker.repo_planning.run_git_command", fake_run_git_command)

    is_valid, error, resolved = validate_repo_path(str(repo))
    assert is_valid is True
    assert error is None
    assert resolved == repo.resolve()


def test_scan_repo_detects_requested_targets(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()

    (repo / "README.md").write_text("hello", encoding="utf-8")
    (repo / "requirements.txt").write_text("pytest", encoding="utf-8")
    (repo / "docker-compose.yml").write_text("services: {}", encoding="utf-8")
    (repo / "src").mkdir()
    (repo / "tests").mkdir()

    result = scan_repo(repo)

    assert "README.md" in result["found_files"]
    assert "requirements.txt" in result["found_files"]
    assert "docker-compose.yml" in result["found_files"]
    assert "src" in result["found_directories"]
    assert "tests" in result["found_directories"]


def test_collect_git_summary_parses_output(tmp_path: Path, monkeypatch) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()

    outputs = {
        "status_short": " M file.py\n",
        "branch_show_current": "main\n",
        "remote_v": "origin https://example/repo.git (fetch)\norigin https://example/repo.git (push)\n",
    }

    def fake_run_git_command(repo_path: Path, command_key: str):
        assert repo_path == repo
        return True, outputs[command_key]

    monkeypatch.setattr("worker.repo_planning.run_git_command", fake_run_git_command)

    summary = collect_git_summary(repo)
    assert summary["branch"] == "main"
    assert summary["is_dirty"] is True
    assert len(summary["remotes"]) == 2


def test_profile_and_plan_generation(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()

    scan_result = {
        "found_files": ["README.md", "requirements.txt"],
        "found_directories": ["src", "tests"],
    }
    git_summary = {
        "branch": "main",
        "is_dirty": False,
        "status_short": "",
        "remotes": ["origin https://example/repo.git (fetch)"],
    }

    profile = build_repo_profile(
        project_name="Example",
        repo_path=repo,
        git_summary=git_summary,
        scan_result=scan_result,
    )

    assert profile["project_name"] == "Example"
    assert profile["repo_path"] == str(repo)
    assert "python" in profile["detected_stack"]
    assert "pytest" in profile["test_commands"]

    task = {
        "id": "task-123",
        "project_id": "proj-1",
        "objective": "Add endpoint validation",
    }
    plan = generate_plan_markdown(task, profile)

    assert "# Implementation Plan" in plan
    assert "Add endpoint validation" in plan
    assert "Likely Tests To Run" in plan
