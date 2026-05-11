"""
Transaction wrapper system for atomic multi-phase operations with rollback support.

Manages checkpoint state at each phase boundary, provides rollback capability,
logs state transitions, and supports replay from checkpoints.
"""

from datetime import datetime
from typing import Any, Dict, Optional, List
import json
import uuid
from enum import Enum

from sqlalchemy.orm import Session

from ..models import AgentPhase, AgentPhaseStatus, OrchestrationLog, OrchestrationOperation


class TransactionState(str, Enum):
    """States of a transaction."""
    ACTIVE = "active"
    COMMITTED = "committed"
    ROLLED_BACK = "rolled_back"
    FAILED = "failed"


class Checkpoint:
    """Represents a savepoint within a transaction."""
    
    def __init__(self, phase_id: str, data: Dict[str, Any]):
        self.checkpoint_id = str(uuid.uuid4())
        self.phase_id = phase_id
        self.data = data
        self.created_at = datetime.utcnow()
        self.valid = True
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert checkpoint to dictionary."""
        return {
            "checkpoint_id": self.checkpoint_id,
            "phase_id": self.phase_id,
            "data": self.data,
            "created_at": self.created_at.isoformat(),
            "valid": self.valid
        }


class TransactionLog:
    """In-memory log of transaction operations."""
    
    def __init__(self, transaction_id: str, task_id: str):
        self.transaction_id = transaction_id
        self.task_id = task_id
        self.operations: List[Dict[str, Any]] = []
        self.checkpoints: Dict[str, Checkpoint] = {}
    
    def add_operation(self, operation: str, details: Dict[str, Any]) -> None:
        """Record an operation in the transaction log."""
        self.operations.append({
            "timestamp": datetime.utcnow().isoformat(),
            "operation": operation,
            "details": details
        })
    
    def add_checkpoint(self, checkpoint: Checkpoint) -> None:
        """Store a checkpoint for potential rollback."""
        self.checkpoints[checkpoint.checkpoint_id] = checkpoint
        self.add_operation("checkpoint_created", {
            "checkpoint_id": checkpoint.checkpoint_id,
            "phase_id": checkpoint.phase_id
        })
    
    def get_checkpoint(self, checkpoint_id: str) -> Optional[Checkpoint]:
        """Retrieve a checkpoint by ID."""
        return self.checkpoints.get(checkpoint_id)
    
    def list_checkpoints(self) -> List[Checkpoint]:
        """List all checkpoints in this transaction."""
        return list(self.checkpoints.values())


class TransactionWrapper:
    """
    Manages atomic operations across agent phases with checkpoint/rollback support.
    
    Provides:
    - Checkpoint creation at phase boundaries
    - Rollback to prior checkpoints
    - State transition logging
    - Replay capability from checkpoints
    """
    
    def __init__(self, task_id: str, db: Session):
        self.transaction_id = str(uuid.uuid4())
        self.task_id = task_id
        self.db = db
        self.state = TransactionState.ACTIVE
        self.log = TransactionLog(self.transaction_id, task_id)
        self.current_phase: Optional[AgentPhase] = None
    
    def begin_phase(self, phase_id: str, phase_type: str, context: Dict[str, Any]) -> None:
        """
        Begin execution of a phase.
        
        Args:
            phase_id: Unique identifier for this phase
            phase_type: Type of phase (planner, implementer, tester, reviewer)
            context: Input context for the phase
        """
        phase = self.db.query(AgentPhase).filter(
            AgentPhase.id == phase_id
        ).first()
        
        if not phase:
            raise ValueError(f"Phase {phase_id} not found")
        
        self.current_phase = phase
        phase.status = AgentPhaseStatus.IN_PROGRESS
        phase.started_at = datetime.utcnow()
        phase.context = context
        
        self.db.add(phase)
        self.db.flush()
        
        self.log.add_operation("phase_began", {
            "phase_id": phase_id,
            "phase_type": phase_type,
            "context_keys": list(context.keys()) if context else []
        })
    
    def create_checkpoint(self, data: Dict[str, Any]) -> Checkpoint:
        """
        Create a checkpoint for the current phase state.
        
        Args:
            data: State data to save for rollback
        
        Returns:
            Created checkpoint
        """
        if not self.current_phase:
            raise RuntimeError("No active phase for checkpoint")
        
        checkpoint = Checkpoint(phase_id=self.current_phase.id, data=data)
        
        # Save checkpoint to phase model
        if self.current_phase.checkpoint_state is None:
            self.current_phase.checkpoint_state = {}
        
        self.current_phase.checkpoint_state[checkpoint.checkpoint_id] = checkpoint.to_dict()
        self.db.add(self.current_phase)
        self.db.flush()
        
        self.log.add_checkpoint(checkpoint)
        
        return checkpoint
    
    def complete_phase(self, output: Dict[str, Any]) -> None:
        """
        Mark the current phase as completed.
        
        Args:
            output: Results from the phase
        """
        if not self.current_phase:
            raise RuntimeError("No active phase to complete")
        
        self.current_phase.status = AgentPhaseStatus.COMPLETED
        self.current_phase.completed_at = datetime.utcnow()
        self.current_phase.output = output
        
        # Calculate duration in seconds
        if self.current_phase.started_at:
            duration = (self.current_phase.completed_at - self.current_phase.started_at).total_seconds()
            self.current_phase.duration = int(duration)
        
        self.db.add(self.current_phase)
        self.db.flush()
        
        self.log.add_operation("phase_completed", {
            "phase_id": self.current_phase.id,
            "phase_type": self.current_phase.phase_type.value,
            "duration_seconds": self.current_phase.duration,
            "output_keys": list(output.keys()) if output else []
        })
    
    def fail_phase(self, error: str) -> None:
        """
        Mark the current phase as failed.
        
        Args:
            error: Error message
        """
        if not self.current_phase:
            raise RuntimeError("No active phase to fail")
        
        self.current_phase.status = AgentPhaseStatus.FAILED
        self.current_phase.error = error
        self.current_phase.completed_at = datetime.utcnow()
        
        if self.current_phase.started_at:
            duration = (self.current_phase.completed_at - self.current_phase.started_at).total_seconds()
            self.current_phase.duration = int(duration)
        
        self.db.add(self.current_phase)
        self.db.flush()
        
        self.state = TransactionState.FAILED
        self.log.add_operation("phase_failed", {
            "phase_id": self.current_phase.id,
            "error": error
        })
    
    def rollback_to_checkpoint(self, checkpoint_id: str) -> None:
        """
        Rollback to a previous checkpoint.
        
        Args:
            checkpoint_id: ID of checkpoint to rollback to
        """
        checkpoint = self.log.get_checkpoint(checkpoint_id)
        if not checkpoint:
            raise ValueError(f"Checkpoint {checkpoint_id} not found")
        
        if not checkpoint.valid:
            raise RuntimeError(f"Checkpoint {checkpoint_id} is no longer valid")
        
        # Mark phases after this point as rolled back
        phase = self.db.query(AgentPhase).filter(
            AgentPhase.id == checkpoint.phase_id
        ).first()
        
        if phase:
            phase.status = AgentPhaseStatus.ROLLED_BACK
            self.db.add(phase)
        
        self.db.flush()
        
        self.log.add_operation("rollback_executed", {
            "checkpoint_id": checkpoint_id,
            "phase_id": checkpoint.phase_id,
            "restored_data_keys": list(checkpoint.data.keys())
        })
    
    def handoff_to_phase(self, source_phase_type: str, target_phase_type: str) -> None:
        """
        Record a handoff from one phase to the next.
        
        Args:
            source_phase_type: Type of source phase
            target_phase_type: Type of target phase
        """
        self.log.add_operation("handoff", {
            "source_phase": source_phase_type,
            "target_phase": target_phase_type,
            "source_phase_id": self.current_phase.id if self.current_phase else None
        })
    
    def commit(self) -> None:
        """Commit the transaction (mark as successfully completed)."""
        self.state = TransactionState.COMMITTED
        self.log.add_operation("transaction_committed", {
            "transaction_id": self.transaction_id,
            "checkpoint_count": len(self.log.checkpoints)
        })
        self.db.commit()
    
    def get_transaction_log(self) -> Dict[str, Any]:
        """Get the full transaction log."""
        return {
            "transaction_id": self.transaction_id,
            "task_id": self.task_id,
            "state": self.state.value,
            "operations": self.log.operations,
            "checkpoint_count": len(self.log.checkpoints),
            "checkpoints": [cp.to_dict() for cp in self.log.list_checkpoints()]
        }
    
    def replay_from_checkpoint(self, checkpoint_id: str) -> Dict[str, Any]:
        """
        Get the state data from a checkpoint for replay.
        
        Args:
            checkpoint_id: ID of checkpoint to replay from
        
        Returns:
            Checkpoint state data
        """
        checkpoint = self.log.get_checkpoint(checkpoint_id)
        if not checkpoint:
            raise ValueError(f"Checkpoint {checkpoint_id} not found")
        
        self.log.add_operation("replay_initiated", {
            "checkpoint_id": checkpoint_id,
            "phase_id": checkpoint.phase_id
        })
        
        return checkpoint.data
