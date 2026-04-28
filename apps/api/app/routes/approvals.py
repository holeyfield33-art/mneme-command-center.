from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from ..database import get_db
from ..models import Approval, ApprovalStatus, ApprovalType, Task, TaskStatus, Project
from ..workflow import status_after_approval
from ..utils import generate_id, verify_token
from ..notifier import ApiNotifier
from .auth import verify_token_header

router = APIRouter(prefix="/approvals", tags=["approvals"])
notifier = ApiNotifier()


class ApprovalResponse(BaseModel):
    id: str
    task_id: str
    type: str
    title: str
    summary: str
    risk_level: str
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True


@router.get("", response_model=list[ApprovalResponse])
def list_approvals(
    status: str = None,
    task_id: str = None,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """List approvals, optionally filtered by status or task."""
    verify_token_header(authorization)
    
    query = db.query(Approval)
    
    if status:
        query = query.filter(Approval.status == ApprovalStatus(status))
    if task_id:
        query = query.filter(Approval.task_id == task_id)
    
    return query.all()


@router.post("/{approval_id}/approve")
def approve_approval(
    approval_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Approve an approval request."""
    verify_token_header(authorization)
    
    approval = db.query(Approval).filter(Approval.id == approval_id).first()
    if not approval:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval not found"
        )
    
    if approval.status != ApprovalStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Approval is not pending"
        )
    
    approval.status = ApprovalStatus.APPROVED
    
    # Update task status based on approval type
    task = db.query(Task).filter(Task.id == approval.task_id).first()
    if task:
        next_status = status_after_approval(task.status.value, approval.type.value, approved=True)
        task.status = TaskStatus(next_status)

        project_name = "project"
        project = db.query(Project).filter(Project.id == task.project_id).first()
        if project:
            project_name = project.name

        task_link = notifier.task_link(task.id)
        if approval.type == ApprovalType.PLAN:
            notifier.send(
                (
                    f"Mneme plan approved: {project_name}\n"
                    f"Execution can proceed.\n"
                    f"Open: {task_link}"
                ).strip()
            )
        elif approval.type in {ApprovalType.DIFF, ApprovalType.DIFF_REVIEW}:
            notifier.send(
                (
                    f"Mneme task completed stage: {project_name}\n"
                    f"Diff review approved.\n"
                    f"Open: {task_link}"
                ).strip()
            )
    
    db.commit()
    db.refresh(approval)
    return approval


@router.post("/{approval_id}/reject")
def reject_approval(
    approval_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """Reject an approval request."""
    verify_token_header(authorization)
    
    approval = db.query(Approval).filter(Approval.id == approval_id).first()
    if not approval:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval not found"
        )
    
    if approval.status != ApprovalStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Approval is not pending"
        )
    
    approval.status = ApprovalStatus.REJECTED
    
    # Update task status based on approval type
    task = db.query(Task).filter(Task.id == approval.task_id).first()
    if task:
        next_status = status_after_approval(task.status.value, approval.type.value, approved=False)
        task.status = TaskStatus(next_status)
    
    db.commit()
    db.refresh(approval)
    return approval
