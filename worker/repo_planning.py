from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ALLOWED_GIT_COMMANDS: dict[str, list[str]] = {
    "status_short": ["git", "status", "--short"],
    "branch_show_current": ["git", "branch", "--show-current"],
    "remote_v": ["git", "remote", "-v"],
    "diff_stat": ["git", "diff", "--stat"],
    "diff_name_only": ["git", "diff", "--name-only"],
    "diff_check": ["git", "diff", "--check"],
    "branch_list": ["git", "branch", "--list"],
}

SAFE_TEST_COMMANDS = {
    "pytest",
    "npm test",
    "npm run test",
    "pnpm test",
    "yarn test",
}

SCAN_TARGETS = [
    "README.md",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "app",
    "apps",
    "src",
    "tests",
    ".github/workflows",
    "render.yaml",
    "vercel.json",
    "docker-compose.yml",
    ".env.example",
]


def slugify_project_name(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "project"


def slugify_task_objective(objective: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", objective.strip().lower()).strip("-")
    return slug or "task"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_git_command(repo_path: Path, command_key: str) -> tuple[bool, str]:
    command = ALLOWED_GIT_COMMANDS[command_key]
    try:
        result = subprocess.run(
            command,
            cwd=repo_path,
            check=False,
            capture_output=True,
            text=True,
            timeout=8,
        )
    except (subprocess.SubprocessError, OSError) as exc:
        return False, str(exc)

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        return False, stderr or stdout or f"command failed with code {result.returncode}"

    return True, (result.stdout or "").strip()


def validate_repo_path(repo_path: str) -> tuple[bool, str | None, Path | None]:
    path = Path(repo_path).expanduser().resolve()

    if not path.exists():
        return False, f"repo_path does not exist: {repo_path}", None

    if not path.is_dir():
        return False, f"repo_path is not a directory: {repo_path}", None

    if not (path / ".git").exists():
        return False, f"repo_path is not a git repository (.git missing): {repo_path}", None

    ok, output = run_git_command(path, "status_short")
    if not ok:
        return False, f"repo_path is not a valid git repository: {output}", None

    return True, None, path


def collect_git_summary(repo_path: Path) -> dict[str, Any]:
    ok_status, status_short = run_git_command(repo_path, "status_short")
    ok_branch, branch = run_git_command(repo_path, "branch_show_current")
    ok_remote, remote_v = run_git_command(repo_path, "remote_v")

    if not (ok_status and ok_branch and ok_remote):
        problems = []
        if not ok_status:
            problems.append(f"status: {status_short}")
        if not ok_branch:
            problems.append(f"branch: {branch}")
        if not ok_remote:
            problems.append(f"remote: {remote_v}")
        raise RuntimeError("; ".join(problems))

    status_short = (status_short or "").strip()
    branch = (branch or "").strip()
    remote_v = (remote_v or "").strip()

    remotes = [line.strip() for line in remote_v.splitlines() if line.strip()]

    return {
        "branch": branch or "unknown",
        "is_dirty": bool(status_short.strip()),
        "status_short": status_short,
        "remotes": remotes,
    }


def scan_repo(repo_path: Path) -> dict[str, Any]:
    found_files: list[str] = []
    found_directories: list[str] = []

    for target in SCAN_TARGETS:
        full_path = repo_path / target
        if full_path.is_file():
            found_files.append(target)
        elif full_path.is_dir():
            found_directories.append(target)

    return {
        "found_files": sorted(found_files),
        "found_directories": sorted(found_directories),
    }


def detect_stack(scan_result: dict[str, Any]) -> list[str]:
    found_files = set(scan_result.get("found_files", []))
    found_directories = set(scan_result.get("found_directories", []))

    stack: list[str] = []
    if "package.json" in found_files:
        stack.append("nodejs")
    if "pyproject.toml" in found_files or "requirements.txt" in found_files:
        stack.append("python")
    if "src" in found_directories and "nodejs" not in stack:
        stack.append("frontend_or_service")
    if "docker-compose.yml" in found_files:
        stack.append("docker")

    return stack or ["unknown"]


def guess_test_commands(scan_result: dict[str, Any]) -> list[str]:
    found_files = set(scan_result.get("found_files", []))
    commands: list[str] = []

    if "package.json" in found_files:
        commands.append("npm test")
    if "pyproject.toml" in found_files or "requirements.txt" in found_files:
        commands.append("pytest")

    if not commands:
        commands.append("No obvious test command detected")

    return commands


def find_deployment_files(scan_result: dict[str, Any]) -> list[str]:
    found_files = set(scan_result.get("found_files", []))
    deployment_candidates = ["render.yaml", "vercel.json", "docker-compose.yml"]
    return [name for name in deployment_candidates if name in found_files]


def build_risk_notes(scan_result: dict[str, Any], git_summary: dict[str, Any]) -> list[str]:
    notes: list[str] = []

    if git_summary.get("is_dirty"):
        notes.append("Repository has uncommitted changes")

    found_directories = set(scan_result.get("found_directories", []))
    found_files = set(scan_result.get("found_files", []))

    if "tests" not in found_directories and "tests" not in found_files:
        notes.append("No top-level tests directory detected")

    deployment_files = find_deployment_files(scan_result)
    if deployment_files:
        notes.append(
            "Deployment-related files detected: " + ", ".join(deployment_files)
        )

    if ".env.example" in found_files:
        notes.append("Environment configuration template present")

    return notes or ["No obvious high-risk repo signals detected"]


def estimate_risk_level(scan_result: dict[str, Any], risk_notes: list[str]) -> str:
    found_files = set(scan_result.get("found_files", []))

    high_indicators = {"docker-compose.yml", "render.yaml", "vercel.json"}
    if high_indicators.intersection(found_files):
        return "high"

    if any("uncommitted" in note.lower() for note in risk_notes):
        return "medium"

    return "low"


def build_repo_profile(
    project_name: str,
    repo_path: Path,
    git_summary: dict[str, Any],
    scan_result: dict[str, Any],
) -> dict[str, Any]:
    stack = detect_stack(scan_result)
    risk_notes = build_risk_notes(scan_result, git_summary)

    important_files = sorted(
        list(scan_result.get("found_files", [])) + list(scan_result.get("found_directories", []))
    )

    return {
        "project_name": project_name,
        "repo_path": str(repo_path),
        "detected_stack": stack,
        "important_files": important_files,
        "test_commands": guess_test_commands(scan_result),
        "deployment_files": find_deployment_files(scan_result),
        "risk_notes": risk_notes,
        "git": git_summary,
        "last_scanned_timestamp": utc_now_iso(),
    }


def generate_plan_markdown(task: dict[str, Any], profile: dict[str, Any]) -> str:
    objective = task.get("objective", "")
    risk_level = estimate_risk_level(
        {"found_files": [f for f in profile.get("important_files", []) if "." in f]},
        profile.get("risk_notes", []),
    )

    stack = ", ".join(profile.get("detected_stack", []))
    important_files = "\n".join(f"- {item}" for item in profile.get("important_files", []))
    risk_notes = "\n".join(f"- {note}" for note in profile.get("risk_notes", []))
    test_commands = "\n".join(f"- {cmd}" for cmd in profile.get("test_commands", []))

    return (
        f"# Implementation Plan\n\n"
        f"## Task\n"
        f"- Task ID: {task.get('id')}\n"
        f"- Objective: {objective}\n"
        f"- Project ID: {task.get('project_id')}\n\n"
        f"## Repo Profile\n"
        f"- Project Name: {profile.get('project_name')}\n"
        f"- Repo Path: {profile.get('repo_path')}\n"
        f"- Detected Stack: {stack}\n"
        f"- Branch: {profile.get('git', {}).get('branch', 'unknown')}\n"
        f"- Working Tree Dirty: {profile.get('git', {}).get('is_dirty', False)}\n\n"
        f"### Important Files\n"
        f"{important_files or '- None detected'}\n\n"
        f"### Risk Notes\n"
        f"{risk_notes or '- No risk notes'}\n\n"
        f"## Proposed Implementation Steps\n"
        f"1. Confirm exact code areas mapped to the objective from repo structure and README.\n"
        f"2. Prepare a minimal change plan scoped to relevant modules only.\n"
        f"3. Implement changes incrementally with clear checkpoints and logs.\n"
        f"4. Run targeted tests first, then broader suite if available.\n"
        f"5. Verify acceptance criteria and produce concise change summary.\n\n"
        f"## Likely Tests To Run\n"
        f"{test_commands}\n\n"
        f"## Acceptance Criteria\n"
        f"- Proposed changes align with objective and detected repo stack.\n"
        f"- Risk-sensitive files are handled with explicit caution.\n"
        f"- Planned tests cover touched areas before completion.\n"
        f"- Worker-generated plan is ready for review and approval.\n\n"
        f"## Planning Metadata\n"
        f"- Generated At: {utc_now_iso()}\n"
        f"- Computed Risk Level: {risk_level}\n"
    )


def choose_branch_name(task_objective: str, task_id: str, existing_branches: list[str]) -> str:
    base = f"mneme/{slugify_task_objective(task_objective)}"
    if base not in existing_branches:
        return base
    return f"{base}-{task_id[:8]}"


def is_safe_test_command(command: str) -> bool:
    return command.strip() in SAFE_TEST_COMMANDS


def normalize_changed_files(diff_name_only: str) -> list[str]:
    return sorted({line.strip() for line in diff_name_only.splitlines() if line.strip()})


def classify_changed_file_risk(changed_files: list[str]) -> tuple[str, list[str]]:
    high_risk_patterns = [
        re.compile(r"(^|/)\.env($|\.)"),
        re.compile(r"(^|/)secrets?(/|$)", re.IGNORECASE),
        re.compile(r"billing", re.IGNORECASE),
        re.compile(r"auth", re.IGNORECASE),
        re.compile(r"deploy|deployment|render\.yaml|vercel\.json|docker-compose\.yml", re.IGNORECASE),
        re.compile(r"^\.github/workflows/", re.IGNORECASE),
    ]

    matched: list[str] = []
    for path in changed_files:
        if any(pattern.search(path) for pattern in high_risk_patterns):
            matched.append(path)

    if matched:
        return "high", [
            "High-risk files changed; require explicit review before any future commit phase.",
            "Matched files: " + ", ".join(matched),
        ]

    if len(changed_files) > 20:
        return "medium", ["Large change set detected (>20 files)."]

    return "low", ["No high-risk changed-file patterns detected."]


def generate_claude_prompt_markdown(
    task: dict[str, Any],
    profile: dict[str, Any],
    approved_plan_text: str,
    approved_plan_path: str,
    likely_files: list[str],
    test_commands: list[str],
) -> str:
    stack = ", ".join(profile.get("detected_stack", []))
    likely_files_text = "\n".join(f"- {path}" for path in likely_files)
    tests_text = "\n".join(f"- {cmd}" for cmd in test_commands)

    return (
        "# Claude Code Execution Prompt\n\n"
        "## Objective\n"
        f"- Task ID: {task.get('id')}\n"
        f"- Objective: {task.get('objective')}\n"
        f"- Project ID: {task.get('project_id')}\n\n"
        "## Approved Plan\n"
        f"- Plan path: {approved_plan_path}\n\n"
        "```markdown\n"
        f"{approved_plan_text.strip()}\n"
        "```\n\n"
        "## Repo Profile Summary\n"
        f"- Repo path: {profile.get('repo_path')}\n"
        f"- Stack: {stack}\n"
        f"- Branch: {profile.get('git', {}).get('branch', 'unknown')}\n"
        f"- Dirty: {profile.get('git', {}).get('is_dirty', False)}\n\n"
        "## Files Likely Involved\n"
        f"{likely_files_text or '- none'}\n\n"
        "## Tests To Run\n"
        f"{tests_text or '- none'}\n\n"
        "## Safety Constraints\n"
        "- Do not commit.\n"
        "- Do not push.\n"
        "- Do not deploy.\n"
        "- Do not edit env files or secrets.\n"
        "- Avoid destructive commands and preserve existing behavior unless required by the task.\n"
    )


def generate_diff_summary_markdown(
    task_id: str,
    branch_name: str,
    status_short: str,
    diff_stat: str,
    changed_files: list[str],
    diff_check: str,
    test_results: list[dict[str, Any]],
    risk_level: str,
    risk_notes: list[str],
) -> str:
    files_text = "\n".join(f"- {path}" for path in changed_files)
    tests_text = "\n".join(
        f"- {result['command']}: {'passed' if result['success'] else 'failed'}"
        for result in test_results
    )
    risk_text = "\n".join(f"- {note}" for note in risk_notes)

    return (
        "# Diff Summary\n\n"
        f"- Task ID: {task_id}\n"
        f"- Branch: {branch_name}\n"
        f"- Generated At: {utc_now_iso()}\n"
        f"- Risk Level: {risk_level}\n\n"
        "## Git Status (--short)\n"
        "```\n"
        f"{status_short or '(clean)'}\n"
        "```\n\n"
        "## Git Diff Stat\n"
        "```\n"
        f"{diff_stat or '(no diff stat)'}\n"
        "```\n\n"
        "## Changed Files\n"
        f"{files_text or '- none'}\n\n"
        "## git diff --check\n"
        "```\n"
        f"{diff_check or '(no whitespace or conflict markers detected)'}\n"
        "```\n\n"
        "## Test Results\n"
        f"{tests_text or '- no tests executed'}\n\n"
        "## Risk Notes\n"
        f"{risk_text}\n"
    )

    stack = ", ".join(profile.get("detected_stack", []))
    important_files = "\n".join(f"- {item}" for item in profile.get("important_files", []))
    risk_notes = "\n".join(f"- {note}" for note in profile.get("risk_notes", []))
    test_commands = "\n".join(f"- {cmd}" for cmd in profile.get("test_commands", []))

    return (
        f"# Implementation Plan\n\n"
        f"## Task\n"
        f"- Task ID: {task.get('id')}\n"
        f"- Objective: {objective}\n"
        f"- Project ID: {task.get('project_id')}\n\n"
        f"## Repo Profile\n"
        f"- Project Name: {profile.get('project_name')}\n"
        f"- Repo Path: {profile.get('repo_path')}\n"
        f"- Detected Stack: {stack}\n"
        f"- Branch: {profile.get('git', {}).get('branch', 'unknown')}\n"
        f"- Working Tree Dirty: {profile.get('git', {}).get('is_dirty', False)}\n\n"
        f"### Important Files\n"
        f"{important_files or '- None detected'}\n\n"
        f"### Risk Notes\n"
        f"{risk_notes or '- No risk notes'}\n\n"
        f"## Proposed Implementation Steps\n"
        f"1. Confirm exact code areas mapped to the objective from repo structure and README.\n"
        f"2. Prepare a minimal change plan scoped to relevant modules only.\n"
        f"3. Implement changes incrementally with clear checkpoints and logs.\n"
        f"4. Run targeted tests first, then broader suite if available.\n"
        f"5. Verify acceptance criteria and produce concise change summary.\n\n"
        f"## Likely Tests To Run\n"
        f"{test_commands}\n\n"
        f"## Acceptance Criteria\n"
        f"- Proposed changes align with objective and detected repo stack.\n"
        f"- Risk-sensitive files are handled with explicit caution.\n"
        f"- Planned tests cover touched areas before completion.\n"
        f"- Worker-generated plan is ready for review and approval.\n\n"
        f"## Planning Metadata\n"
        f"- Generated At: {utc_now_iso()}\n"
        f"- Computed Risk Level: {risk_level}\n"
    )


def save_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def save_markdown(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
