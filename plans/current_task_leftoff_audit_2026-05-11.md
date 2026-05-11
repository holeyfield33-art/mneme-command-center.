# Current Task Left-Off Audit (2026-05-11)

## Completed in this pass

1. Removed temporary password-debug endpoint and password logging from API auth route.
2. Removed dashboard login debug flow (debug button, debug output panel, console instrumentation).
3. Removed frontend debug auth client method and API URL console logging.
4. Added ignore rules for generated local task-run artifacts and Playwright output folders.
5. Re-ran validation gates:
   - Frontend build: passing
   - Backend tests: 30 passed, 12 skipped

## Still open / unfinished

1. Queue persistence controls are still UI-only in Queue Manager.
   - Drag-reorder currently updates local state only.
   - Pause/resume/cancel controls are placeholder logic and not persisted through backend APIs.
2. CI completion gate is still pending external verification.
   - `plans/phase11_ci_e2e_checklist.md` has `CI run green on GitHub after push` unchecked.
3. Playwright local smoke failures in this environment were due to missing system libs (`libatk-1.0.so.0`) when Chromium launches without `--with-deps` install path.

## Observed generated artifacts

1. `plans/task-*_claude_run.json` files were updated with new timestamps from task-run simulations.
2. `plans/task-timeout_claude_run.json` still reports timeout (`exit_code: 124`, `success: false`), representing a known failed scenario fixture.

## Recommended next actionable task

Implement real queue control APIs and wire Queue Manager to them:

1. Add backend endpoints for priority reorder, pause, resume, and cancel.
2. Extend task status model where needed (for paused/cancelled semantics).
3. Replace Queue Manager placeholder handlers with API calls and optimistic UI + rollback on failure.
4. Add backend tests and UI smoke coverage for queue control persistence.
