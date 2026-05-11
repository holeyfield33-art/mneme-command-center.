"""
AgentOrchestrator - Service for managing multi-phase agent workflows.

Orchestrates the 4-phase agent flow:
1. Planner: Analyzes requirements and creates a plan
2. Implementer: Writes code based on the plan
3. Tester: Validates the implementation
4. Reviewer: Performs final review and approval
"""

from datetime import datetime
from typing import Any, Dict, Optional, List
import uuid

from sqlalchemy.orm import Session

from ..models import (
    Task,
    AgentPhase,
    AgentPhaseType,
    AgentPhaseStatus,
    OrchestrationLog,
    OrchestrationOperation,
)
from ..security.transactions import TransactionWrapper, TransactionState
from ..database import SessionLocal


class AgentOrchestrator:
    """
    Manages orchestration of multi-phase agent workflows.
    
    Coordinates:
    - Phase progression (Planner → Implementer → Tester → Reviewer)
    - Prerequisite checks before phase execution
    - Phase failure handling and rollback
    - Handoff logic between phases
    - Transaction management with checkpoints
    """
    
    PHASE_ORDER = [
        AgentPhaseType.PLANNER,
        AgentPhaseType.IMPLEMENTER,
        AgentPhaseType.TESTER,
        AgentPhaseType.REVIEWER,
    ]
    
    PHASE_PREREQUISITES: Dict[AgentPhaseType, List[AgentPhaseType]] = {
        AgentPhaseType.PLANNER: [],
        AgentPhaseType.IMPLEMENTER: [AgentPhaseType.PLANNER],
        AgentPhaseType.TESTER: [AgentPhaseType.PLANNER, AgentPhaseType.IMPLEMENTER],
        AgentPhaseType.REVIEWER: [
            AgentPhaseType.PLANNER,
            AgentPhaseType.IMPLEMENTER,
            AgentPhaseType.TESTER,
        ],
    }
    
    def __init__(self, task_id: str, db: Optional[Session] = None):
        self.task_id = task_id
        self.db = db or SessionLocal()
        self.transaction: Optional[TransactionWrapper] = None
        self.phases: Dict[AgentPhaseType, AgentPhase] = {}
    
    def initialize_workflow(self) -> None:
        """Initialize the workflow by creating AgentPhase entries for all 4 phases."""
        task = self.db.query(Task).filter(Task.id == self.task_id).first()
        if not task:
            raise ValueError(f"Task {self.task_id} not found")
        
        # Create agent phase records for each phase
        for phase_type in self.PHASE_ORDER:
            existing = self.db.query(AgentPhase).filter(
                AgentPhase.task_id == self.task_id,
                AgentPhase.phase_type == phase_type,
            ).first()
            
            if not existing:
                phase = AgentPhase(
                    id=str(uuid.uuid4()),
                    task_id=self.task_id,
                    phase_type=phase_type,
                    status=AgentPhaseStatus.PENDING,
                )
                self.db.add(phase)
                self.phases[phase_type] = phase
        
        self.db.commit()
    
    def check_prerequisites(self, phase_type: AgentPhaseType) -> tuple[bool, Optional[str]]:
        """
        Check if all prerequisites for a phase are met.
        
        Args:
            phase_type: Type of phase to check
        
        Returns:
            Tuple of (prerequisites_met, error_message)
        """
        prerequisites = self.PHASE_PREREQUISITES.get(phase_type, [])
        
        if not prerequisites:
            return True, None
        
        for prereq_phase in prerequisites:
            prereq = self.db.query(AgentPhase).filter(
                AgentPhase.task_id == self.task_id,
                AgentPhase.phase_type == prereq_phase,
            ).first()
            
            if not prereq:
                return False, f"Prerequisite phase {prereq_phase.value} does not exist"
            
            if prereq.status != AgentPhaseStatus.COMPLETED:
                return False, f"Prerequisite phase {prereq_phase.value} not completed (status: {prereq.status.value})"
        
        return True, None
    
    def start_phase(self, phase_type: AgentPhaseType, context: Dict[str, Any]) -> AgentPhase:
        """
        Start execution of a phase.
        
        Args:
            phase_type: Type of phase to start
            context: Input context for the phase
        
        Returns:
            The AgentPhase object
        
        Raises:
            ValueError if prerequisites not met
        """
        # Check prerequisites
        prereqs_met, error_msg = self.check_prerequisites(phase_type)
        if not prereqs_met:
            raise ValueError(f"Cannot start {phase_type.value}: {error_msg}")
        
        # Get or create phase
        phase = self.db.query(AgentPhase).filter(
            AgentPhase.task_id == self.task_id,
            AgentPhase.phase_type == phase_type,
        ).first()
        
        if not phase:
            phase = AgentPhase(
                id=str(uuid.uuid4()),
                task_id=self.task_id,
                phase_type=phase_type,
                status=AgentPhaseStatus.PENDING,
            )
            self.db.add(phase)
        
        phase.status = AgentPhaseStatus.IN_PROGRESS
        phase.started_at = datetime.utcnow()
        phase.context = context
        self.db.add(phase)
        self.db.flush()
        
        # If transaction is active, begin phase in transaction
        if self.transaction:
            self.transaction.begin_phase(phase.id, phase_type.value, context)
        
        # Log orchestration event
        self._log_orchestration(
            actor=phase_type.value,
            operation=OrchestrationOperation.PHASE_STARTED,
            details={"phase_id": phase.id, "context_keys": list(context.keys())},
        )
        
        self.phases[phase_type] = phase
        return phase
    
    def complete_phase(
        self, phase_type: AgentPhaseType, output: Dict[str, Any]
    ) -> AgentPhase:
        """
        Mark a phase as completed.
        
        Args:
            phase_type: Type of phase to complete
            output: Output/results from the phase
        
        Returns:
            The completed AgentPhase object
        """
        phase = self.db.query(AgentPhase).filter(
            AgentPhase.task_id == self.task_id,
            AgentPhase.phase_type == phase_type,
        ).first()
        
        if not phase:
            raise ValueError(f"Phase {phase_type.value} not found for task {self.task_id}")
        
        phase.status = AgentPhaseStatus.COMPLETED
        phase.completed_at = datetime.utcnow()
        phase.output = output
        
        if phase.started_at:
            duration = (phase.completed_at - phase.started_at).total_seconds()
            phase.duration = int(duration)
        
        self.db.add(phase)
        self.db.flush()
        
        # If transaction is active, complete phase in transaction
        if self.transaction:
            self.transaction.complete_phase(output)
        
        # Log orchestration event
        self._log_orchestration(
            actor=phase_type.value,
            operation=OrchestrationOperation.PHASE_COMPLETED,
            target_phase=phase_type.value,
            details={
                "phase_id": phase.id,
                "duration_seconds": phase.duration,
                "output_keys": list(output.keys()) if output else [],
            },
        )
        
        return phase
    
    def fail_phase(self, phase_type: AgentPhaseType, error: str) -> AgentPhase:
        """
        Mark a phase as failed.
        
        Args:
            phase_type: Type of phase that failed
            error: Error message
        
        Returns:
            The failed AgentPhase object
        """
        phase = self.db.query(AgentPhase).filter(
            AgentPhase.task_id == self.task_id,
            AgentPhase.phase_type == phase_type,
        ).first()
        
        if not phase:
            raise ValueError(f"Phase {phase_type.value} not found for task {self.task_id}")
        
        phase.status = AgentPhaseStatus.FAILED
        phase.error = error
        phase.completed_at = datetime.utcnow()
        
        if phase.started_at:
            duration = (phase.completed_at - phase.started_at).total_seconds()
            phase.duration = int(duration)
        
        self.db.add(phase)
        self.db.flush()
        
        # If transaction is active, fail phase in transaction
        if self.transaction:
            self.transaction.fail_phase(error)
        
        # Log orchestration event
        self._log_orchestration(
            actor=phase_type.value,
            operation=OrchestrationOperation.PHASE_FAILED,
            details={"phase_id": phase.id, "error": error},
            status="error",
        )
        
        return phase
    
    def handoff_to_next_phase(
        self, current_phase_type: AgentPhaseType
    ) -> Optional[AgentPhaseType]:
        """
        Execute handoff logic to the next phase.
        
        Args:
            current_phase_type: Type of phase handing off
        
        Returns:
            Next phase type, or None if this is the last phase
        """
        try:
            current_index = self.PHASE_ORDER.index(current_phase_type)
        except ValueError:
            raise ValueError(f"Unknown phase type: {current_phase_type}")
        
        if current_index >= len(self.PHASE_ORDER) - 1:
            # Last phase - no handoff
            return None
        
        next_phase_type = self.PHASE_ORDER[current_index + 1]
        
        # Log handoff
        if self.transaction:
            self.transaction.handoff_to_phase(
                current_phase_type.value, next_phase_type.value
            )
        
        self._log_orchestration(
            actor=current_phase_type.value,
            operation=OrchestrationOperation.HANDOFF,
            source_phase=current_phase_type.value,
            target_phase=next_phase_type.value,
            details={"handoff_reason": "phase_completion"},
        )
        
        return next_phase_type
    
    def get_workflow_status(self) -> Dict[str, Any]:
        """
        Get the current status of the entire workflow.
        
        Returns:
            Dictionary with status of each phase
        """
        phases = self.db.query(AgentPhase).filter(
            AgentPhase.task_id == self.task_id
        ).all()
        
        status = {
            "task_id": self.task_id,
            "phases": {},
            "overall_status": "pending",
            "current_phase": None,
        }
        
        for phase in phases:
            status["phases"][phase.phase_type.value] = {
                "id": phase.id,
                "status": phase.status.value,
                "started_at": phase.started_at.isoformat() if phase.started_at else None,
                "completed_at": phase.completed_at.isoformat()
                if phase.completed_at
                else None,
                "duration": phase.duration,
                "error": phase.error,
            }
            
            if phase.status == AgentPhaseStatus.IN_PROGRESS:
                status["current_phase"] = phase.phase_type.value
        
        # Determine overall status
        all_statuses = [p.status for p in phases]
        if any(s == AgentPhaseStatus.FAILED for s in all_statuses):
            status["overall_status"] = "failed"
        elif any(s == AgentPhaseStatus.ROLLED_BACK for s in all_statuses):
            status["overall_status"] = "rolled_back"
        elif all(s == AgentPhaseStatus.COMPLETED for s in all_statuses):
            status["overall_status"] = "completed"
        elif any(s == AgentPhaseStatus.IN_PROGRESS for s in all_statuses):
            status["overall_status"] = "in_progress"
        
        return status
    
    def rollback_from_phase(self, phase_type: AgentPhaseType) -> None:
        """
        Rollback from a specific phase (mark it and subsequent phases as rolled back).
        
        Args:
            phase_type: Phase to rollback from
        """
        try:
            from_index = self.PHASE_ORDER.index(phase_type)
        except ValueError:
            raise ValueError(f"Unknown phase type: {phase_type}")
        
        # Mark this and all subsequent phases as rolled back
        for i in range(from_index, len(self.PHASE_ORDER)):
            phase_to_rollback = self.PHASE_ORDER[i]
            phase = self.db.query(AgentPhase).filter(
                AgentPhase.task_id == self.task_id,
                AgentPhase.phase_type == phase_to_rollback,
            ).first()
            
            if phase and phase.status != AgentPhaseStatus.COMPLETED:
                phase.status = AgentPhaseStatus.ROLLED_BACK
                self.db.add(phase)
        
        self.db.flush()
        
        # Log rollback
        self._log_orchestration(
            actor=phase_type.value,
            operation=OrchestrationOperation.ROLLBACK,
            details={"rollback_from_phase": phase_type.value},
        )
    
    def begin_transaction(self) -> TransactionWrapper:
        """
        Begin a new transaction for the workflow.
        
        Returns:
            The transaction wrapper
        """
        self.transaction = TransactionWrapper(self.task_id, self.db)
        
        self._log_orchestration(
            actor="orchestrator",
            operation=OrchestrationOperation.CHECKPOINT,
            details={"transaction_id": self.transaction.transaction_id},
        )
        
        return self.transaction
    
    def commit_transaction(self) -> Optional[Dict[str, Any]]:
        """
        Commit the current transaction.
        
        Returns:
            Transaction log, or None if no transaction active
        """
        if not self.transaction:
            return None
        
        self.transaction.commit()
        return self.transaction.get_transaction_log()
    
    def _log_orchestration(
        self,
        actor: str,
        operation: OrchestrationOperation,
        source_phase: Optional[str] = None,
        target_phase: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        status: str = "ok",
    ) -> OrchestrationLog:
        """
        Log an orchestration event.
        
        Args:
            actor: Phase or component that triggered the operation
            operation: Type of operation
            source_phase: Source phase for handoff operations
            target_phase: Target phase for handoff operations
            details: Additional metadata
            status: Status of the operation (ok, warning, error)
        
        Returns:
            The created OrchestrationLog entry
        """
        log_entry = OrchestrationLog(
            id=str(uuid.uuid4()),
            task_id=self.task_id,
            actor=actor,
            operation=operation,
            source_phase=source_phase,
            target_phase=target_phase,
            status=status,
            details=details or {},
        )
        
        self.db.add(log_entry)
        self.db.flush()
        
        return log_entry
