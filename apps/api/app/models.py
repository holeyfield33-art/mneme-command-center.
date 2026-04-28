from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, Enum, ForeignKey, Boolean
from sqlalchemy.orm import relationship
import enum

from .database import Base


class ProjectStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class TaskStatus(str, enum.Enum):
    QUEUED = "queued"
    PLANNING = "planning"
    WAITING_FOR_PLAN_APPROVAL = "waiting_for_plan_approval"
    PLAN_APPROVED = "plan_approved"
    PLAN_REJECTED = "plan_rejected"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"


class TaskMode(str, enum.Enum):
    AUTONOMOUS = "autonomous"
    INTERACTIVE = "interactive"


class RiskLevel(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ApprovalType(str, enum.Enum):
    PLAN = "plan"
    DIFF = "diff"


class ApprovalStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class LogLevel(str, enum.Enum):
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class WorkerStatus(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    STOPPED = "stopped"


class Project(Base):
    __tablename__ = "projects"
    
    id = Column(String, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    repo_path = Column(String)
    repo_url = Column(String, nullable=True)
    default_branch = Column(String, default="main")
    status = Column(Enum(ProjectStatus), default=ProjectStatus.ACTIVE)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")


class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(String, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    objective = Column(Text)
    status = Column(Enum(TaskStatus), default=TaskStatus.QUEUED, index=True)
    mode = Column(Enum(TaskMode), default=TaskMode.INTERACTIVE)
    risk_level = Column(Enum(RiskLevel), default=RiskLevel.MEDIUM)
    branch_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    project = relationship("Project", back_populates="tasks")
    logs = relationship("Log", back_populates="task", cascade="all, delete-orphan")
    approvals = relationship("Approval", back_populates="task", cascade="all, delete-orphan")


class Approval(Base):
    __tablename__ = "approvals"
    
    id = Column(String, primary_key=True, index=True)
    task_id = Column(String, ForeignKey("tasks.id"), index=True)
    type = Column(Enum(ApprovalType), default=ApprovalType.PLAN)
    title = Column(String)
    summary = Column(Text)
    risk_level = Column(Enum(RiskLevel), default=RiskLevel.MEDIUM)
    status = Column(Enum(ApprovalStatus), default=ApprovalStatus.PENDING, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    task = relationship("Task", back_populates="approvals")


class Log(Base):
    __tablename__ = "logs"
    
    id = Column(String, primary_key=True, index=True)
    task_id = Column(String, ForeignKey("tasks.id"), index=True)
    level = Column(Enum(LogLevel), default=LogLevel.INFO)
    message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    task = relationship("Task", back_populates="logs")


class Worker(Base):
    __tablename__ = "workers"
    
    worker_id = Column(String, primary_key=True, index=True)
    hostname = Column(String)
    status = Column(Enum(WorkerStatus), default=WorkerStatus.OFFLINE)
    last_seen = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SystemState(Base):
    __tablename__ = "system_state"
    
    key = Column(String, primary_key=True)
    value = Column(String)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
