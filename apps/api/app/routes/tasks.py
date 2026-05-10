from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path
import json
import re

from ..database import get_db
from ..models import Task, TaskStatus, TaskMode, RiskLevel, Log, LogLevel, Approval, ApprovalStatus, ApprovalType, Project
from ..events import broadcast_now
from ..utils import generate_id, verify_token
from ..notifier import ApiNotifier
from ..config import settings
from .auth import verify_token_header

router = APIRouter(prefix="/tasks", tags=["tasks"])
notifier = ApiNotifier()


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
    branch_name: str | None = None
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


def _artifact_dir() -> Path:
    if settings.claude_artifact_dir.strip():
        return Path(settings.claude_artifact_dir).expanduser().resolve()
    return Path(__file__).resolve().parents[3] / "plans"


def _artifact_path(task_id: str, artifact_type: str) -> Path:
    suffix_map = {
        "stdout": "_claude_stdout.log",
        "stderr": "_claude_stderr.log",
        "meta": "_claude_run.json",
        "prompt": "_claude_prompt.md",
        "diff": "_diff_summary.md",
    }
    if artifact_type not in suffix_map:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid artifact type")

    path = (_artifact_dir() / f"{task_id}{suffix_map[artifact_type]}").resolve()
    try:
        path.relative_to(_artifact_dir())
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid artifact path") from exc
    return path


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

    broadcast_now(
        "task_created",
        {
            "task_id": task.id,
            "project_id": task.project_id,
            "status": task.status.value,
        },
    )

    task_link = notifier.task_link(task.id)
    notifier.send(
        (
            f"Mneme task created: {project.name}\n"
            f"Objective: {task.objective[:120]}\n"
            f"Open: {task_link}"
        ).strip()
    )
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

    broadcast_now(
        "task_log_added",
        {
            "task_id": task_id,
            "log_id": log.id,
            "level": log.level.value,
            "message": log.message,
        },
    )
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

    broadcast_now(
        "task_status_changed",
        {
            "task_id": task.id,
            "project_id": task.project_id,
            "status": task.status.value,
        },
    )
    return task


@router.post("/{task_id}/rerun-claude")
def rerun_task_claude(
    task_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Queue a failed task for Claude re-execution from approved plan state."""
    verify_token_header(authorization)

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    if task.status not in {TaskStatus.FAILED, TaskStatus.DIFF_REVIEW_APPROVED}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task must be failed or diff_review_approved to rerun Claude"
        )

    latest_approved_plan = (
        db.query(Approval)
        .filter(
            Approval.task_id == task.id,
            Approval.type == ApprovalType.PLAN,
            Approval.status == ApprovalStatus.APPROVED,
        )
        .order_by(Approval.created_at.desc())
        .first()
    )
    if not latest_approved_plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task cannot rerun without an approved plan"
        )

    task.status = TaskStatus.PLAN_APPROVED
    task.updated_at = datetime.utcnow()
    db.add(
        Log(
            id=generate_id(),
            task_id=task_id,
            level=LogLevel.INFO,
            message="Manual rerun requested: queued for Claude execution",
        )
    )
    db.commit()
    db.refresh(task)

    broadcast_now(
        "task_status_changed",
        {
            "task_id": task.id,
            "project_id": task.project_id,
            "status": task.status.value,
        },
    )
    return {"status": "queued_for_rerun", "task_id": task.id}


@router.get("/{task_id}/artifacts/{artifact_type}")
def get_task_artifact(
    task_id: str,
    artifact_type: str,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Fetch task artifact content for Claude execution diagnostics."""
    verify_token_header(authorization)

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    path = _artifact_path(task_id, artifact_type)
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artifact not found"
        )

    raw = path.read_text(encoding="utf-8")
    content = raw
    parsed_json = None
    if artifact_type == "meta":
        try:
            parsed_json = json.loads(raw)
            content = json.dumps(parsed_json, indent=2)
        except json.JSONDecodeError:
            parsed_json = None

    return {
        "task_id": task_id,
        "artifact_type": artifact_type,
        "path": str(path),
        "content": content,
        "json": parsed_json,
        "size_bytes": path.stat().st_size,
    }


@router.get("/{task_id}/github-pr-status")
def get_task_github_pr_status(
    task_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Return live GitHub PR status using the latest PR URL logged for this task."""
    verify_token_header(authorization)

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    if not settings.github_token.strip():
        return {
            "configured": False,
            "status": "missing_github_token",
            "pr_url": None,
        }

    logs = db.query(Log).filter(Log.task_id == task_id).order_by(Log.created_at.desc()).all()
    pr_url = None
    for log in logs:
        message = log.message or ""
        if message.startswith("GitHub PR URL:"):
            pr_url = message.split("GitHub PR URL:", 1)[1].strip()
            break

    if not pr_url:
        return {
            "configured": True,
            "status": "no_pr_url_logged",
            "pr_url": None,
        }

    from worker.github_client import get_pull_request_status

    ok, payload = get_pull_request_status(pr_url, settings.github_token.strip())
    if not ok:
        return {
            "configured": True,
            "status": "error",
            "pr_url": pr_url,
            "error": str(payload),
        }

    return {
        "configured": True,
        "status": "ok",
        "pr_url": pr_url,
        "pr": payload,
    }
