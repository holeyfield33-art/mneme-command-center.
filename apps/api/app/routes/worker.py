from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from ..database import get_db
from ..models import Worker, WorkerStatus, Task, TaskStatus, Approval, ApprovalType, ApprovalStatus
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
    objective: str
    status: str
    
    class Config:
        from_attributes = True


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
    
    tasks = db.query(Task).filter(Task.status == TaskStatus.QUEUED).all()
    return tasks


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


@router.post("/tasks/{task_id}/approval-request")
def create_approval_request(
    task_id: str,
    title: str,
    summary: str,
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
        type=ApprovalType.PLAN,
        title=title,
        summary=summary,
        status=ApprovalStatus.PENDING
    )
    
    task.status = TaskStatus.WAITING_FOR_PLAN_APPROVAL
    task.updated_at = datetime.utcnow()
    
    db.add(approval)
    db.commit()
    db.refresh(approval)
    
    return approval
