# Phase 10 Safety Remediation Checklist

This checklist tracks execution against the prioritized remediation list.

## P0 (Blockers)

- [x] Agent sandboxing (Docker/chroot isolation for every agent execution)
- Sandbox mode guards bash tool (`AGENT_SANDBOX_MODE=docker`); budget enforcement added; task-level model override prevents unauthorized provider substitution.
- [x] Real-time UI migration complete (remove polling, rely on SSE/WebSocket)
- [x] Remove mock/fake fallback data everywhere (explicit offline/error states only)

## P1 (High Priority)

- [x] Cost guardrails (pre-turn estimate + budget enforcement + visible UI costs)
- Token counting + cost estimation in AgentLoop, `AGENT_BUDGET_USD` enforcement, `/tasks/{id}/cost` API, cost widget in TaskDetail.
- [x] Rollback system (rollback endpoint + UI wired via WorkflowCanvas)
- `POST /api/v1/tasks/{id}/orchestration/rollback` fully implemented; WorkflowCanvas already exposes rollback UI.
- [x] Vault auto-lock max 15 minutes + enforced re-auth for pushes
- [x] Parallel/sequential orchestration (task decomposition + scheduler)
- 4-phase orchestrator (Planner → Implementer → Tester → Reviewer) + WorkflowCanvas UI already complete.

## P2 (Quality)

- [ ] Premium visual design system (component library/Tailwind + dark theme + motion)
- [x] Global error handling (error boundary + user-friendly failures)
- [x] Model switching (per-task model_provider + model_name fields, TaskForm selector, worker picks task over project default)

## P3 (Completeness)

- [x] Skills integration (active skills injected into AgentLoop system prompt via `active_skills` param)

## Validation Gates

- [x] Frontend build passing
- [x] Backend tests passing
- [x] CI-equivalent local checks passing
