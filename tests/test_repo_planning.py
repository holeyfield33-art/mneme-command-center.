from pathlib import Path

from worker.repo_planning import (
    build_repo_profile,
    choose_branch_name,
    classify_changed_file_risk,
    collect_git_summary,
    generate_claude_prompt_markdown,
    generate_diff_summary_markdown,
    generate_plan_markdown,
    is_safe_test_command,
    normalize_changed_files,
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


def test_choose_branch_name_uses_suffix_on_collision() -> None:
    branch = choose_branch_name(
        task_objective="Add Login Form",
        task_id="abcd1234efgh5678",
        existing_branches=["mneme/add-login-form"],
    )
    assert branch == "mneme/add-login-form-abcd1234"


def test_prompt_generation_includes_safety_constraints() -> None:
    task = {"id": "task-1", "project_id": "proj-1", "objective": "Implement feature"}
    profile = {
        "repo_path": "/tmp/repo",
        "detected_stack": ["python"],
        "git": {"branch": "main", "is_dirty": False},
    }
    prompt = generate_claude_prompt_markdown(
        task=task,
        profile=profile,
        approved_plan_text="approved plan text",
        approved_plan_path="plans/task-1.md",
        likely_files=["src/main.py"],
        test_commands=["pytest"],
    )
    assert "Do not commit." in prompt
    assert "Do not push." in prompt
    assert "approved plan text" in prompt


def test_diff_summary_and_risk_classification() -> None:
    changed = normalize_changed_files("src/app.py\n.github/workflows/ci.yml\n")
    risk, notes = classify_changed_file_risk(changed)
    assert risk == "high"
    assert any("High-risk" in note for note in notes)

    summary = generate_diff_summary_markdown(
        task_id="task-1",
        branch_name="mneme/task",
        status_short=" M src/app.py",
        diff_stat=" src/app.py | 2 +-",
        changed_files=changed,
        diff_check="",
        test_results=[{"command": "pytest", "success": True}],
        risk_level=risk,
        risk_notes=notes,
    )
    assert "Diff Summary" in summary
    assert ".github/workflows/ci.yml" in summary


def test_safe_test_command_filter() -> None:
    assert is_safe_test_command("pytest") is True
    assert is_safe_test_command("npm test") is True
    assert is_safe_test_command("python script.py") is False
