# Phase 10 Safety Remediation Checklist

This checklist tracks execution against the prioritized remediation list.

## P0 (Blockers)

- [ ] Agent sandboxing (Docker/chroot isolation for every agent execution)
	- Progress: Docker sandbox execution mode added for agent bash tool (`AGENT_SANDBOX_MODE=docker`), full isolation rollout still pending for all execution paths.
- [x] Real-time UI migration complete (remove polling, rely on SSE/WebSocket)
- [x] Remove mock/fake fallback data everywhere (explicit offline/error states only)

## P1 (High Priority)

- [ ] Cost guardrails (pre-turn estimate + budget enforcement + visible UI costs)
- [ ] Rollback system (transaction log + point-in-time revert)
- [x] Vault auto-lock max 15 minutes + enforced re-auth for pushes
- [ ] Parallel/sequential orchestration (task decomposition + scheduler)

## P2 (Quality)

- [ ] Premium visual design system (component library/Tailwind + dark theme + motion)
- [x] Global error handling (error boundary + user-friendly failures)
- [ ] Model switching (per-agent model assignment + warm/cold + VRAM warnings)

## P3 (Completeness)

- [ ] Skills integration (registry wired into system prompt and tool permissions)

## Validation Gates

- [x] Frontend build passing
- [x] Backend tests passing
- [x] CI-equivalent local checks passing
