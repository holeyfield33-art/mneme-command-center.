from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))

from app.workflow import status_after_approval


def test_plan_approval_status_transition() -> None:
    assert status_after_approval("waiting_for_plan_approval", "plan", approved=True) == "queued_for_execution"


def test_diff_review_approval_status_transition() -> None:
    assert status_after_approval("waiting_for_diff_review", "diff_review", approved=True) == "diff_review_approved"


def test_plan_rejection_status_transition() -> None:
    assert status_after_approval("waiting_for_plan_approval", "plan", approved=False) == "plan_rejected"
