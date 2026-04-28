from __future__ import annotations


def status_after_approval(current_status: str, approval_type: str, approved: bool) -> str:
    """Return next task status after an approval decision.

    String-based on purpose to keep workflow logic testable without ORM dependencies.
    """
    if approved:
        if approval_type == "plan" and current_status == "waiting_for_plan_approval":
            return "queued_for_execution"
        if approval_type in {"diff", "diff_review"} and current_status == "waiting_for_diff_review":
            return "diff_review_approved"
        return current_status

    if approval_type == "plan" and current_status == "waiting_for_plan_approval":
        return "plan_rejected"
    if approval_type in {"diff", "diff_review"} and current_status == "waiting_for_diff_review":
        return "failed"
    return current_status
