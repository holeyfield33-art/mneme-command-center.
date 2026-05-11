"""
API endpoints for multi-phase task orchestration.

Provides REST API for:
- Listing agent phases for a task
- Getting orchestration status
- Viewing orchestration logs
- Triggering phase completion/failure
- Initiating rollbacks
"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional

from ..database import get_db
from ..models import (
    Task,
    AgentPhase,
    AgentPhaseType,
    AgentPhaseStatus,
    OrchestrationLog,
    OrchestrationOperation,
)
from ..services.orchestration import AgentOrchestrator

router = APIRouter(prefix="/api/v1/tasks", tags=["orchestration"])

PHASE_SEQUENCE = [
    AgentPhaseType.PLANNER,
    AgentPhaseType.IMPLEMENTER,
    AgentPhaseType.TESTER,
    AgentPhaseType.REVIEWER,
]
def _normalize_checkpoint(
    checkpoint: Dict[str, Any],
    phase: AgentPhase,
    source: str,
) -> Dict[str, Any]:
    created_at = checkpoint.get("created_at")
    if not created_at and phase.completed_at:
        created_at = phase.completed_at.isoformat()

    return {
        "checkpoint_id": checkpoint.get("checkpoint_id"),
        "phase_id": phase.id,
        "phase_type": phase.phase_type.value,
        "source": source,
        "created_at": created_at,
        "valid": bool(checkpoint.get("valid", True)),
        "has_data": bool(checkpoint.get("data") or phase.output or phase.context),
        "data": checkpoint.get("data", {}),
    }


def _find_checkpoint_phase(
    checkpoint_id: str,
    phases_by_id: Dict[str, AgentPhase],
    phases: List[AgentPhase],
) -> Optional[AgentPhase]:
    if checkpoint_id.startswith("phase-snapshot:"):
        phase_id = checkpoint_id.split(":", 1)[1]
        return phases_by_id.get(phase_id)

    for phase in phases:
        checkpoint_state = phase.checkpoint_state or {}
        if checkpoint_id in checkpoint_state:
            return phase

    return None


@router.get("/{task_id}/orchestration/phases")
async def get_task_phases(
    task_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Get all agent phases for a task.
    
    Args:
        task_id: Task ID
    
    Returns:
        List of phases with their status and details
    """
    # Verify task exists
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    phases = db.query(AgentPhase).filter(
        AgentPhase.task_id == task_id
    ).all()
    
    return {
        "task_id": task_id,
        "phases": [
            {
                "id": p.id,
                "phase_type": p.phase_type.value,
                "status": p.status.value,
                "started_at": p.started_at.isoformat() if p.started_at else None,
                "completed_at": p.completed_at.isoformat() if p.completed_at else None,
                "duration": p.duration,
                "has_error": bool(p.error),
                "error": p.error,
            }
            for p in phases
        ]
    }


@router.get("/{task_id}/orchestration/status")
async def get_orchestration_status(
    task_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Get the current orchestration status for a task.
    
    Args:
        task_id: Task ID
    
    Returns:
        Overall workflow status and current phase details
    """
    # Verify task exists
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    orchestrator = AgentOrchestrator(task_id, db)
    status = orchestrator.get_workflow_status()
    
    return status


@router.post("/{task_id}/orchestration/phases/{phase_type}/complete")
async def complete_phase(
    task_id: str,
    phase_type: str,
    output: Dict[str, Any],
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Mark a phase as completed with output.
    
    Args:
        task_id: Task ID
        phase_type: Type of phase (planner, implementer, tester, reviewer)
        output: Output/results from the phase
    
    Returns:
        Updated phase information
    """
    # Verify task exists
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Validate phase type
    try:
        phase_enum = AgentPhaseType[phase_type.upper()]
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid phase type. Must be one of: {', '.join([p.value for p in AgentPhaseType])}"
        )
    
    orchestrator = AgentOrchestrator(task_id, db)
    
    try:
        completed_phase = orchestrator.complete_phase(phase_enum, output)
        
        return {
            "id": completed_phase.id,
            "phase_type": completed_phase.phase_type.value,
            "status": completed_phase.status.value,
            "completed_at": completed_phase.completed_at.isoformat() if completed_phase.completed_at else None,
            "duration": completed_phase.duration,
            "output_keys": list(output.keys()) if output else [],
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{task_id}/orchestration/phases/{phase_type}/fail")
async def fail_phase(
    task_id: str,
    phase_type: str,
    error: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Mark a phase as failed.
    
    Args:
        task_id: Task ID
        phase_type: Type of phase (planner, implementer, tester, reviewer)
        error: Error message
    
    Returns:
        Updated phase information
    """
    # Verify task exists
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Validate phase type
    try:
        phase_enum = AgentPhaseType[phase_type.upper()]
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid phase type. Must be one of: {', '.join([p.value for p in AgentPhaseType])}"
        )
    
    orchestrator = AgentOrchestrator(task_id, db)
    
    try:
        failed_phase = orchestrator.fail_phase(phase_enum, error)
        
        return {
            "id": failed_phase.id,
            "phase_type": failed_phase.phase_type.value,
            "status": failed_phase.status.value,
            "error": failed_phase.error,
            "duration": failed_phase.duration,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{task_id}/orchestration/log")
async def get_orchestration_log(
    task_id: str,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Get orchestration audit trail for a task.
    
    Args:
        task_id: Task ID
        limit: Maximum number of log entries to return
        offset: Number of entries to skip
    
    Returns:
        List of orchestration events
    """
    # Verify task exists
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Get log entries
    total = db.query(OrchestrationLog).filter(
        OrchestrationLog.task_id == task_id
    ).count()
    
    entries = db.query(OrchestrationLog).filter(
        OrchestrationLog.task_id == task_id
    ).order_by(
        OrchestrationLog.created_at.desc()
    ).offset(offset).limit(limit).all()
    
    return {
        "task_id": task_id,
        "total": total,
        "limit": limit,
        "offset": offset,
        "entries": [
            {
                "id": e.id,
                "actor": e.actor,
                "operation": e.operation.value,
                "source_phase": e.source_phase,
                "target_phase": e.target_phase,
                "status": e.status,
                "details": e.details or {},
                "created_at": e.created_at.isoformat(),
            }
            for e in entries
        ]
    }


@router.get("/{task_id}/orchestration/checkpoints")
async def get_orchestration_checkpoints(
    task_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """List available checkpoints and phase snapshots for resume flows."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    phases = db.query(AgentPhase).filter(AgentPhase.task_id == task_id).all()

    phase_index = {phase_type.value: idx for idx, phase_type in enumerate(PHASE_SEQUENCE)}
    ordered_phases = sorted(phases, key=lambda phase: phase_index.get(phase.phase_type.value, 999))

    checkpoints: List[Dict[str, Any]] = []
    for phase in ordered_phases:
        checkpoint_state = phase.checkpoint_state or {}
        for checkpoint_id, checkpoint in checkpoint_state.items():
            record = _normalize_checkpoint(
                checkpoint={
                    "checkpoint_id": checkpoint_id,
                    "created_at": checkpoint.get("created_at"),
                    "valid": checkpoint.get("valid", True),
                    "data": checkpoint.get("data", {}),
                },
                phase=phase,
                source="explicit",
            )
            checkpoints.append(record)

        if phase.status in {AgentPhaseStatus.COMPLETED, AgentPhaseStatus.ROLLED_BACK}:
            snapshot = _normalize_checkpoint(
                checkpoint={
                    "checkpoint_id": f"phase-snapshot:{phase.id}",
                    "created_at": phase.completed_at.isoformat() if phase.completed_at else datetime.utcnow().isoformat(),
                    "valid": True,
                    "data": {
                        "status": phase.status.value,
                        "output": phase.output,
                        "context": phase.context,
                    },
                },
                phase=phase,
                source="phase_snapshot",
            )
            checkpoints.append(snapshot)

    checkpoints.sort(key=lambda item: item.get("created_at") or "", reverse=True)

    return {
        "task_id": task_id,
        "count": len(checkpoints),
        "checkpoints": checkpoints,
    }


@router.post("/{task_id}/orchestration/rollback")
async def rollback_orchestration(
    task_id: str,
    from_phase: Optional[str] = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Rollback orchestration from a specific phase.
    
    Args:
        task_id: Task ID
        from_phase: Phase to rollback from (default: current phase)
    
    Returns:
        Updated workflow status after rollback
    """
    # Verify task exists
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    orchestrator = AgentOrchestrator(task_id, db)
    
    # Determine phase to rollback from
    if from_phase:
        try:
            phase_enum = AgentPhaseType[from_phase.upper()]
        except KeyError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid phase type. Must be one of: {', '.join([p.value for p in AgentPhaseType])}"
            )
    else:
        # Use current phase
        current = db.query(AgentPhase).filter(
            AgentPhase.task_id == task_id,
            AgentPhase.status == AgentPhaseStatus.IN_PROGRESS
        ).first()
        
        if not current:
            raise HTTPException(
                status_code=400,
                detail="No active phase to rollback from"
            )
        
        phase_enum = current.phase_type
    
    try:
        orchestrator.rollback_from_phase(phase_enum)
        status = orchestrator.get_workflow_status()
        
        return {
            "rollback_initiated": True,
            "rollback_from_phase": phase_enum.value,
            "workflow_status": status,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{task_id}/orchestration/resume")
async def resume_orchestration(
    task_id: str,
    request: Dict[str, Any],
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Resume orchestration from a checkpoint by resetting downstream phases to pending.

    Args:
        task_id: Task ID
        request: Must include checkpoint_id

    Returns:
        Updated workflow status after resume reset
    """
    checkpoint_id = (request or {}).get("checkpoint_id")
    if not checkpoint_id:
        raise HTTPException(status_code=400, detail="checkpoint_id is required")

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    phases = db.query(AgentPhase).filter(AgentPhase.task_id == task_id).all()
    if not phases:
        raise HTTPException(status_code=400, detail="No orchestration phases available to resume")

    phases_by_id = {phase.id: phase for phase in phases}
    checkpoint_phase = _find_checkpoint_phase(checkpoint_id, phases_by_id, phases)
    if not checkpoint_phase:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    phase_index = {phase_type: idx for idx, phase_type in enumerate(PHASE_SEQUENCE)}
    ordered_phases = sorted(phases, key=lambda phase: phase_index.get(phase.phase_type, 999))
    checkpoint_index = phase_index.get(checkpoint_phase.phase_type)
    if checkpoint_index is None:
        raise HTTPException(status_code=400, detail="Invalid checkpoint phase")

    for phase in ordered_phases:
        current_index = phase_index.get(phase.phase_type)
        if current_index is None:
            continue

        if current_index > checkpoint_index:
            phase.status = AgentPhaseStatus.PENDING
            phase.started_at = None
            phase.completed_at = None
            phase.duration = None
            phase.error = None
            phase.output = None
        elif phase.id == checkpoint_phase.id and phase.status in {AgentPhaseStatus.FAILED, AgentPhaseStatus.ROLLED_BACK}:
            phase.status = AgentPhaseStatus.COMPLETED
            phase.error = None
            if not phase.completed_at:
                phase.completed_at = datetime.utcnow()

        db.add(phase)

    log_entry = OrchestrationLog(
        id=f"resume-{task_id}-{datetime.utcnow().timestamp()}",
        task_id=task_id,
        actor="orchestrator",
        operation=OrchestrationOperation.CHECKPOINT,
        source_phase=checkpoint_phase.phase_type.value,
        target_phase=None,
        status="ok",
        details={
            "action": "resume",
            "checkpoint_id": checkpoint_id,
            "resume_from_phase": checkpoint_phase.phase_type.value,
        },
    )
    db.add(log_entry)
    db.commit()

    orchestrator = AgentOrchestrator(task_id, db)
    status = orchestrator.get_workflow_status()
    return {
        "resumed": True,
        "checkpoint_id": checkpoint_id,
        "resume_from_phase": checkpoint_phase.phase_type.value,
        "workflow_status": status,
    }


@router.post("/{task_id}/orchestration/initialize")
async def initialize_orchestration(
    task_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Initialize orchestration workflow for a task.
    
    Creates AgentPhase entries for all 4 phases.
    
    Args:
        task_id: Task ID
    
    Returns:
        Initialized workflow status
    """
    # Verify task exists
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    orchestrator = AgentOrchestrator(task_id, db)
    
    try:
        orchestrator.initialize_workflow()
        status = orchestrator.get_workflow_status()
        
        return {
            "initialized": True,
            "task_id": task_id,
            "workflow_status": status,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
