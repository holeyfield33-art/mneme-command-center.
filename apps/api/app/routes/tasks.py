from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from ..database import get_db
from ..models import Task, TaskStatus, TaskMode, RiskLevel, Log, LogLevel, Approval, ApprovalStatus, ApprovalType, Project
from ..utils import generate_id, verify_token
from .auth import verify_token_header

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    project_id: str
    objective: str
    mode: str = "interactive"
    risk_level: str = "medium"


class TaskResponse(BaseModel):
    id: str
    project_id: str
    objective: str
    status: str
    mode: str
    risk_level: str
    branch_name: str = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class LogCreate(BaseModel):
    level: str = "info"
    message: str


class LogResponse(BaseModel):
    id: str
    task_id: str
    level: str
    message: str
    created_at: datetime
    
    class Config:
        from_attributes = True


@router.get("", response_model=list[TaskResponse])
def list_tasks(
    project_id: str = None,
    status: str = None,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """List tasks, optionally filtered by project and/or status."""
    verify_token_header(authorization)
    
    query = db.query(Task)
    
    if project_id:
        query = query.filter(Task.project_id == project_id)
    if status:
        query = query.filter(Task.status == TaskStatus(status))
    
    return query.all()


@router.post("", response_model=TaskResponse)
def create_task(
    request: TaskCreate,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Create a new task."""
    verify_token_header(authorization)
    
    # Verify project exists
    project = db.query(Project).filter(Project.id == request.project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    task = Task(
        id=generate_id(),
        project_id=request.project_id,
        objective=request.objective,
        status=TaskStatus.QUEUED,
        mode=TaskMode(request.mode),
        risk_level=RiskLevel(request.risk_level),
        branch_name=None
    )
    
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Get task by ID."""
    verify_token_header(authorization)
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    return task


@router.post("/{task_id}/logs", response_model=LogResponse)
def add_task_log(
    task_id: str,
    request: LogCreate,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Add a log to a task."""
    verify_token_header(authorization)
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    log = Log(
        id=generate_id(),
        task_id=task_id,
        level=LogLevel(request.level),
        message=request.message
    )
    
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/{task_id}/logs", response_model=list[LogResponse])
def get_task_logs(
    task_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Get all logs for a task."""
    verify_token_header(authorization)
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    logs = db.query(Log).filter(Log.task_id == task_id).order_by(Log.created_at).all()
    return logs


@router.put("/{task_id}/status")
def update_task_status(
    task_id: str,
    new_status: str,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Update task status."""
    verify_token_header(authorization)
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    task.status = TaskStatus(new_status)
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task
