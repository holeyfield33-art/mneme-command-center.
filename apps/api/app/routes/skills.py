from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import RiskLevel, Skill, SkillCategory
from ..utils import generate_id
from .auth import verify_token_header

router = APIRouter(prefix="/api/v1/skills", tags=["skills"])

_SKILL_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,63}$")

_DEFAULT_SKILLS: list[dict[str, Any]] = [
    {
        "slug": "repo-policy-check",
        "name": "Repository Policy Check",
        "description": "Validate branch protections, required checks, and repo guardrails before execution.",
        "category": SkillCategory.OPERATIONS,
        "max_risk_level": RiskLevel.HIGH,
        "required_approval": True,
        "tool_allowlist": ["read_file", "list_dir", "grep_search"],
        "skill_config": {"enforce_required_checks": True},
    },
    {
        "slug": "plan-quality-gate",
        "name": "Plan Quality Gate",
        "description": "Verify acceptance criteria, test strategy, and rollback plan coverage before implementation.",
        "category": SkillCategory.PLANNING,
        "max_risk_level": RiskLevel.MEDIUM,
        "required_approval": True,
        "tool_allowlist": ["read_file", "grep_search"],
        "skill_config": {"require_test_plan": True},
    },
    {
        "slug": "diff-risk-scorer",
        "name": "Diff Risk Scorer",
        "description": "Assess diff blast radius and flag high-risk changes for mandatory review.",
        "category": SkillCategory.REVIEW,
        "max_risk_level": RiskLevel.HIGH,
        "required_approval": True,
        "tool_allowlist": ["read_file", "grep_search"],
        "skill_config": {"risk_threshold": "medium"},
    },
]


class SkillCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    category: SkillCategory = SkillCategory.IMPLEMENTATION
    enabled: bool = True
    required_approval: bool = True
    max_risk_level: RiskLevel = RiskLevel.MEDIUM
    tool_allowlist: list[str] = Field(default_factory=list)
    skill_config: dict[str, Any] = Field(default_factory=dict)


class SkillUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = None
    category: SkillCategory | None = None
    enabled: bool | None = None
    required_approval: bool | None = None
    max_risk_level: RiskLevel | None = None
    tool_allowlist: list[str] | None = None
    skill_config: dict[str, Any] | None = None


def _serialize_skill(skill: Skill) -> dict[str, Any]:
    return {
        "id": skill.id,
        "slug": skill.slug,
        "name": skill.name,
        "description": skill.description,
        "category": skill.category.value,
        "enabled": skill.enabled,
        "required_approval": skill.required_approval,
        "max_risk_level": skill.max_risk_level.value,
        "tool_allowlist": skill.tool_allowlist or [],
        "skill_config": skill.skill_config or {},
        "created_at": skill.created_at.isoformat() if skill.created_at else None,
        "updated_at": skill.updated_at.isoformat() if skill.updated_at else None,
    }


def _validate_slug(slug: str) -> str:
    normalized = slug.strip().lower()
    if not _SKILL_SLUG_RE.match(normalized):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid slug. Use 2-64 chars: lowercase letters, numbers, underscore, hyphen.",
        )
    return normalized


def _seed_default_skills(db: Session) -> None:
    existing_count = db.query(Skill).count()
    if existing_count > 0:
        return

    for row in _DEFAULT_SKILLS:
        db.add(
            Skill(
                id=generate_id(),
                slug=row["slug"],
                name=row["name"],
                description=row["description"],
                category=row["category"],
                enabled=True,
                required_approval=row["required_approval"],
                max_risk_level=row["max_risk_level"],
                tool_allowlist=row["tool_allowlist"],
                skill_config=row["skill_config"],
            )
        )
    db.commit()


@router.get("")
def list_skills(
    enabled: bool | None = None,
    category: SkillCategory | None = None,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    verify_token_header(authorization)
    _seed_default_skills(db)

    query = db.query(Skill)
    if enabled is not None:
        query = query.filter(Skill.enabled == enabled)
    if category is not None:
        query = query.filter(Skill.category == category)

    rows = query.order_by(Skill.enabled.desc(), Skill.name.asc()).all()
    return [_serialize_skill(row) for row in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_skill(
    body: SkillCreate,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    verify_token_header(authorization)

    slug = _validate_slug(body.slug)
    existing = db.query(Skill).filter(Skill.slug == slug).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Skill slug already exists")

    skill = Skill(
        id=generate_id(),
        slug=slug,
        name=body.name.strip(),
        description=body.description,
        category=body.category,
        enabled=body.enabled,
        required_approval=body.required_approval,
        max_risk_level=body.max_risk_level,
        tool_allowlist=body.tool_allowlist,
        skill_config=body.skill_config,
    )
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return _serialize_skill(skill)


@router.put("/{skill_id}")
def update_skill(
    skill_id: str,
    body: SkillUpdate,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    verify_token_header(authorization)

    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")

    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(skill, key, value)

    db.add(skill)
    db.commit()
    db.refresh(skill)
    return _serialize_skill(skill)


@router.post("/{skill_id}/toggle")
def toggle_skill(
    skill_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    verify_token_header(authorization)

    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")

    skill.enabled = not bool(skill.enabled)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return _serialize_skill(skill)


@router.delete("/{skill_id}")
def delete_skill(
    skill_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    verify_token_header(authorization)

    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")

    db.delete(skill)
    db.commit()
    return {"status": "deleted", "skill_id": skill_id}
