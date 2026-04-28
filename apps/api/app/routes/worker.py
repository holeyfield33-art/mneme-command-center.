from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from ..database import get_db
from ..models import Worker, WorkerStatus, Task, TaskStatus, Approval, ApprovalType, ApprovalStatus, Project, RiskLevel, Log, LogLevel
from ..utils import generate_id, verify_token, is_emergency_stop_active
from .auth import verify_token_header

router = APIRouter(prefix="/worker", tags=["worker"])


class WorkerHeartbeat(BaseModel):
    worker_id: str
    hostname: str


class WorkerStatusResponse(BaseModel):
    worker_id: str
    hostname: str
    status: str
    last_seen: datetime
    
    class Config:
        from_attributes = True


class TaskForWorker(BaseModel):
    id: str
    project_id: str
    project_name: str
    repo_path: str
    objective: str
    mode: str
    risk_level: str
    status: str
    approved_plan_summary: str | None = None
    
    class Config:
        from_attributes = True


    class WorkerLogCreate(BaseModel):
        level: str = "info"
        message: str


@router.post("/heartbeat")
def worker_heartbeat(
    request: WorkerHeartbeat,
    db: Session = Depends(get_db)
):
    """Worker sends heartbeat to report online status."""
    worker = db.query(Worker).filter(Worker.worker_id == request.worker_id).first()
    
    if worker:
        worker.status = WorkerStatus.ONLINE
        worker.last_seen = datetime.utcnow()
    else:
        worker = Worker(
            worker_id=request.worker_id,
            hostname=request.hostname,
            status=WorkerStatus.ONLINE,
            last_seen=datetime.utcnow()
        )
        db.add(worker)
    
    db.commit()
    db.refresh(worker)
    
    return {
        "status": "ok",
        "emergency_stop": is_emergency_stop_active(db)
    }


@router.get("/status")
def get_worker_status(
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    """Get worker status."""
    verify_token_header(authorization)
    
    workers = db.query(Worker).all()
    return workers


@router.get("/tasks/queued", response_model=list[TaskForWorker])
def get_queued_tasks(
    db: Session = Depends(get_db)
):
    """Get all queued tasks for worker to process."""
    # Check emergency stop
    if is_emergency_stop_active(db):
        return []
    
    tasks = (
        db.query(Task, Project)
        .join(Project, Task.project_id == Project.id)
        .filter(Task.status == TaskStatus.QUEUED)
        .all()
    )
    response: list[TaskForWorker] = []
    for task, project in tasks:
        response.append(
            TaskForWorker(
                id=task.id,
                project_id=task.project_id,
                project_name=project.name,
                repo_path=project.repo_path,
                objective=task.objective,
                mode=task.mode.value,
                risk_level=task.risk_level.value,
                status=task.status.value,
            )
        )
    return response


@router.get("/tasks/execution-ready", response_model=list[TaskForWorker])
def get_execution_ready_tasks(
    db: Session = Depends(get_db)
):
    """Get tasks that have approved plans and are ready for execution."""
    if is_emergency_stop_active(db):
        return []

    tasks = (
        db.query(Task, Project)
        .join(Project, Task.project_id == Project.id)
        .filter(Task.status.in_([TaskStatus.QUEUED_FOR_EXECUTION, TaskStatus.APPROVED_FOR_EXECUTION, TaskStatus.PLAN_APPROVED]))
        .all()
    )

    response: list[TaskForWorker] = []
    for task, project in tasks:
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

        response.append(
            TaskForWorker(
                id=task.id,
                project_id=task.project_id,
                project_name=project.name,
                repo_path=project.repo_path,
                objective=task.objective,
                mode=task.mode.value,
                risk_level=task.risk_level.value,
                status=task.status.value,
                approved_plan_summary=latest_approved_plan.summary if latest_approved_plan else None,
            )
        )

    return response


@router.put("/tasks/{task_id}/planning")
def mark_task_planning(
    task_id: str,
    db: Session = Depends(get_db)
):
    """Mark task as planning."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    task.status = TaskStatus.PLANNING
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


@router.put("/tasks/{task_id}/status")
def mark_task_status(
    task_id: str,
    new_status: str,
    db: Session = Depends(get_db)
):
    """Update task status from worker without auth token."""
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


@router.put("/tasks/{task_id}/branch")
def set_task_branch(
    task_id: str,
    branch_name: str,
    db: Session = Depends(get_db)
):
    """Persist branch name selected for task execution."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    task.branch_name = branch_name
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


@router.put("/tasks/{task_id}/failed")
def mark_task_failed(
    task_id: str,
    db: Session = Depends(get_db)
):
    """Mark task as failed."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    task.status = TaskStatus.FAILED
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


@router.post("/tasks/{task_id}/approval-request")
def create_approval_request(
    task_id: str,
    title: str,
    summary: str,
    risk_level: str = "medium",
    approval_type: str = "plan",
    db: Session = Depends(get_db)
):
    """Create an approval request for a task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    approval = Approval(
        id=generate_id(),
        task_id=task_id,
        type=ApprovalType(approval_type),
        title=title,
        summary=summary,
        risk_level=RiskLevel(risk_level),
        status=ApprovalStatus.PENDING
    )

    if approval.type == ApprovalType.PLAN:
        task.status = TaskStatus.WAITING_FOR_PLAN_APPROVAL
    elif approval.type in {ApprovalType.DIFF, ApprovalType.DIFF_REVIEW}:
        task.status = TaskStatus.WAITING_FOR_DIFF_REVIEW

    task.updated_at = datetime.utcnow()
    
    db.add(approval)
    db.commit()
    db.refresh(approval)
    
    return approval


@router.post("/tasks/{task_id}/logs")
def add_worker_task_log(
    task_id: str,
    request: WorkerLogCreate,
    db: Session = Depends(get_db)
):
    """Add a log from worker without auth token."""
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
        message=request.message,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
