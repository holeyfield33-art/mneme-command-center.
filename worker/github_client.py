"""
GitHub integration: clone repos, create PRs, list user repos.
Uses the GitHub REST API via httpx + git CLI for cloning.
"""

from __future__ import annotations

import subprocess
import re
from pathlib import Path
from typing import Any


def _github_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _parse_owner_repo(repo_url: str) -> tuple[str, str]:
    """Extract owner and repo name from a GitHub URL."""
    import re
    match = re.search(r"github\.com[:/]([^/]+)/([^/\\.]+?)(?:\.git)?$", repo_url)
    if not match:
        raise ValueError(f"Cannot parse GitHub owner/repo from URL: {repo_url!r}")
    return match.group(1), match.group(2)


def clone_repo(repo_url: str, local_path: Path, token: str = "") -> tuple[bool, str]:
    """
    Clone a GitHub repo to local_path.
    Injects the token into the URL for authentication if provided.
    Returns (success, message).
    """
    if local_path.exists() and any(local_path.iterdir()):
        return False, f"Target directory already exists and is not empty: {local_path}"

    local_path.mkdir(parents=True, exist_ok=True)

    clone_url = repo_url
    if token:
        # Inject PAT into HTTPS URL: https://<token>@github.com/owner/repo.git
        clone_url = repo_url.replace("https://", f"https://{token}@")
        if not clone_url.startswith("https://"):
            # SSH URL — can't inject token; fall back to plain clone
            clone_url = repo_url

    try:
        result = subprocess.run(
            ["git", "clone", clone_url, str(local_path)],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return False, "git clone timed out after 120s"
    except OSError as exc:
        return False, f"git clone failed: {exc}"

    # Sanitise token from output before returning
    stdout = (result.stdout or "").replace(token, "[REDACTED]") if token else result.stdout or ""
    stderr = (result.stderr or "").replace(token, "[REDACTED]") if token else result.stderr or ""

    if result.returncode != 0:
        return False, f"git clone failed (exit {result.returncode}): {stderr.strip()}"

    return True, f"Cloned {repo_url} to {local_path}"


def create_pull_request(
    repo_url: str,
    token: str,
    branch: str,
    title: str,
    body: str,
    base_branch: str = "main",
) -> tuple[bool, str]:
    """
    Create a GitHub pull request.
    Returns (success, pr_url_or_error).
    """
    try:
        import httpx
    except ImportError:
        return False, "httpx not installed. Run: pip install httpx"

    try:
        owner, repo = _parse_owner_repo(repo_url)
    except ValueError as exc:
        return False, str(exc)

    url = f"https://api.github.com/repos/{owner}/{repo}/pulls"
    payload = {
        "title": title,
        "body": body,
        "head": branch,
        "base": base_branch,
    }

    try:
        response = httpx.post(url, json=payload, headers=_github_headers(token), timeout=20)
    except httpx.RequestError as exc:
        return False, f"GitHub API request failed: {exc}"

    if response.status_code in (200, 201):
        pr_url = response.json().get("html_url", "")
        return True, pr_url

    return False, f"GitHub API error {response.status_code}: {response.text[:500]}"


def push_branch(repo_path: Path, branch: str, remote: str = "origin") -> tuple[bool, str]:
    """Push a local branch to remote so it can be used as PR head."""
    try:
        result = subprocess.run(
            ["git", "push", "-u", remote, branch],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        return False, "git push timed out after 60s"
    except OSError as exc:
        return False, f"git push failed: {exc}"

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        return False, stderr or stdout or f"git push failed with exit code {result.returncode}"

    return True, (result.stdout or "").strip() or "pushed"


def get_pull_request_status(pr_url: str, token: str) -> tuple[bool, dict[str, Any] | str]:
    """
    Get PR status from a GitHub PR URL.
    Returns (success, status_dict_or_error)
    status_dict: {state, merged, mergeable, draft, title, number, url, head, base}
    """
    try:
        import httpx
    except ImportError:
        return False, "httpx not installed. Run: pip install httpx"

    match = re.search(r"github\.com/([^/]+)/([^/]+)/pull/(\d+)", pr_url)
    if not match:
        return False, f"Invalid PR URL: {pr_url}"

    owner, repo, pr_number = match.group(1), match.group(2), match.group(3)
    api_url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"

    try:
        response = httpx.get(api_url, headers=_github_headers(token), timeout=15)
    except httpx.RequestError as exc:
        return False, f"GitHub API request failed: {exc}"

    if response.status_code != 200:
        return False, f"GitHub API error {response.status_code}: {response.text[:300]}"

    data = response.json()
    return True, {
        "state": data.get("state"),
        "merged": data.get("merged"),
        "mergeable": data.get("mergeable"),
        "draft": data.get("draft"),
        "title": data.get("title"),
        "number": data.get("number"),
        "url": data.get("html_url"),
        "head": data.get("head", {}).get("ref"),
        "base": data.get("base", {}).get("ref"),
    }


def list_user_repos(token: str, per_page: int = 100) -> tuple[bool, list[dict[str, Any]]]:
    """
    List repos accessible to the authenticated user (owned + org member).
    Returns (success, list_of_repo_dicts).
    Each dict has: full_name, html_url, clone_url, private, default_branch, description.
    """
    try:
        import httpx
    except ImportError:
        return False, []

    repos: list[dict[str, Any]] = []
    url = f"https://api.github.com/user/repos?per_page={per_page}&sort=updated&affiliation=owner,organization_member"

    try:
        response = httpx.get(url, headers=_github_headers(token), timeout=15)
    except httpx.RequestError:
        return False, []

    if response.status_code != 200:
        return False, []

    for r in response.json():
        repos.append({
            "full_name": r.get("full_name", ""),
            "html_url": r.get("html_url", ""),
            "clone_url": r.get("clone_url", ""),
            "private": r.get("private", False),
            "default_branch": r.get("default_branch", "main"),
            "description": r.get("description") or "",
        })

    return True, repos


def check_token(token: str) -> tuple[bool, str]:
    """Verify a GitHub PAT is valid. Returns (valid, login_or_error)."""
    try:
        import httpx
    except ImportError:
        return False, "httpx not installed"

    try:
        response = httpx.get(
            "https://api.github.com/user",
            headers=_github_headers(token),
            timeout=10,
        )
    except httpx.RequestError as exc:
        return False, str(exc)

    if response.status_code == 200:
        return True, response.json().get("login", "")

    return False, f"Status {response.status_code}: {response.text[:200]}"


def get_branch_diff(repo_path: str, base_branch: str, feature_branch: str) -> str:
    """
    Get a git diff between two branches.
    Runs: git diff {base_branch}...{feature_branch}
    
    Args:
        repo_path: Path to the git repository
        base_branch: Base branch (e.g., "main")
        feature_branch: Feature branch to diff (e.g., "feature/my-changes")
    
    Returns:
        The diff output as a string, capped at 50,000 characters
    
    Raises:
        RuntimeError: If git diff fails
    """
    try:
        result = subprocess.run(
            ["git", "diff", f"{base_branch}...{feature_branch}"],
            cwd=repo_path,
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("git diff timed out after 30s")
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        raise RuntimeError(stderr or f"git diff failed with exit code {exc.returncode}")
    except OSError as exc:
        raise RuntimeError(f"git diff failed: {exc}")
    
    diff_output = result.stdout or ""
    
    # Cap at 50,000 characters and append truncation marker if needed
    if len(diff_output) > 50000:
        diff_output = diff_output[:50000] + "\n\n... diff truncated"
    
    return diff_output
