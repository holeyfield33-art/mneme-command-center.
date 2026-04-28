from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from ..database import get_db
from ..models import Project, ProjectStatus
from ..utils import generate_id, verify_token
from .auth import verify_token_header

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    repo_path: str
    repo_url: str = None
    default_branch: str = "main"


class ProjectUpdate(BaseModel):
    name: str = None
    repo_path: str = None
    repo_url: str = None
    default_branch: str = None
    status: str = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    repo_path: str
    repo_url: str
    default_branch: str
    status: str
    created_at: datetime
    
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
        default_branch=request.default_branch,
        status=ProjectStatus.ACTIVE
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
    if request.default_branch:
        project.default_branch = request.default_branch
    if request.status:
        project.status = ProjectStatus(request.status)
    
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
