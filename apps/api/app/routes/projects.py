from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from ..database import get_db
from ..models import Project, ProjectStatus
from ..utils import generate_id, verify_token
from ..security.vault import vault_service
from .auth import verify_token_header
from pathlib import Path

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    repo_path: str
    repo_url: str = None
    claude_code_command: str | None = None
    default_branch: str = "main"
    model_provider: str | None = None
    model_name: str | None = None


class ProjectUpdate(BaseModel):
    name: str = None
    repo_path: str = None
    repo_url: str = None
    claude_code_command: str | None = None
    default_branch: str = None
    status: str = None
    model_provider: str | None = None
    model_name: str | None = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    repo_path: str
    repo_url: str
    claude_code_command: str | None = None
    default_branch: str
    status: str
    created_at: datetime
    model_provider: str | None = None
    model_name: str | None = None
    
    class Config:
        from_attributes = True


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """List all projects."""
    verify_token_header(authorization)
    
    projects = db.query(Project).all()
    return projects


@router.post("", response_model=ProjectResponse)
def create_project(
    request: ProjectCreate,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Create a new project."""
    verify_token_header(authorization)
    
    # Check if project name already exists
    existing = db.query(Project).filter(Project.name == request.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project name already exists"
        )
    
    project = Project(
        id=generate_id(),
        name=request.name,
        repo_path=request.repo_path,
        repo_url=request.repo_url,
        claude_code_command=request.claude_code_command,
        default_branch=request.default_branch,
        status=ProjectStatus.ACTIVE,
        model_provider=request.model_provider,
        model_name=request.model_name,
    )
    
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Get project by ID."""
    verify_token_header(authorization)
    
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str,
    request: ProjectUpdate,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Update project."""
    verify_token_header(authorization)
    
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    if request.name:
        project.name = request.name
    if request.repo_path:
        project.repo_path = request.repo_path
    if request.repo_url is not None:
        project.repo_url = request.repo_url
    if request.claude_code_command is not None:
        project.claude_code_command = request.claude_code_command
    if request.default_branch:
        project.default_branch = request.default_branch
    if request.status:
        project.status = ProjectStatus(request.status)
    if request.model_provider is not None:
        project.model_provider = request.model_provider or None
    if request.model_name is not None:
        project.model_name = request.model_name or None
    
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}")
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Delete project."""
    verify_token_header(authorization)
    
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    db.delete(project)
    db.commit()
    return {"status": "deleted"}


class GitHubConnectRequest(BaseModel):
    repo_url: str
    name: str | None = None
    default_branch: str = "main"
    model_provider: str | None = None
    model_name: str | None = None


@router.post("/connect-github", response_model=ProjectResponse)
def connect_github_repo(
    request: GitHubConnectRequest,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """Clone a GitHub repo and create a project from it."""
    from ..config import settings
    from worker.github_client import clone_repo, _parse_owner_repo

    verify_token_header(authorization)

    try:
        token = vault_service.maybe_resolve_secret(settings.github_token)
    except RuntimeError:
        raise HTTPException(status_code=401, detail="Vault is locked. Re-authenticate to use GitHub token.")

    if not token:
        raise HTTPException(status_code=400, detail="GITHUB_TOKEN is not configured.")

    try:
        owner, repo_name = _parse_owner_repo(request.repo_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    project_name = request.name or f"{owner}/{repo_name}"
    existing = db.query(Project).filter(Project.name == project_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Project name already exists")

    workspace_dir = settings.github_workspace_dir or str(
        Path(__file__).resolve().parents[4] / "repos"
    )
    local_path = Path(workspace_dir) / owner / repo_name

    ok, msg = clone_repo(request.repo_url, local_path, token)
    if not ok:
        raise HTTPException(status_code=500, detail=f"Clone failed: {msg}")

    project = Project(
        id=generate_id(),
        name=project_name,
        repo_path=str(local_path),
        repo_url=request.repo_url,
        default_branch=request.default_branch,
        status=ProjectStatus.ACTIVE,
        model_provider=request.model_provider,
        model_name=request.model_name,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/github-repos")
def list_github_repos(
    authorization: str = Header(None),
):
    """List GitHub repos accessible with the configured token."""
    from ..config import settings
    from worker.github_client import list_user_repos

    verify_token_header(authorization)

    try:
        token = vault_service.maybe_resolve_secret(settings.github_token)
    except RuntimeError:
        raise HTTPException(status_code=401, detail="Vault is locked. Re-authenticate to use GitHub token.")

    if not token:
        raise HTTPException(status_code=400, detail="GITHUB_TOKEN is not configured.")

    ok, repos = list_user_repos(token)
    if not ok:
        raise HTTPException(status_code=502, detail="Failed to fetch repos from GitHub.")

    return repos
