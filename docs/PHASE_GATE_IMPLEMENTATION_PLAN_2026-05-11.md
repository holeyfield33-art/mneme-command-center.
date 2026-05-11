# Mneme Command Center
## Phase-Gated Implementation Plan (Amended Directive)

Date: 2026-05-11
Branch Baseline: feature/phase2-items-1-4
Status: Phase 9 Implemented (Final polish: motion, empty/error states, enterprise finish) - Ready for Review

## Directive Lock
This plan operationalizes the amended directive:
- User is final orchestrator
- Agents propose, user disposes
- No risky mutation proceeds without explicit approval unless safely whitelisted
- Security-first architecture precedes feature expansion

## Program Goals
1. Convert dashboard from monitor to control panel with mandatory approval hub.
2. Add security foundations before additional autonomy.
3. Add transaction + rollback guarantees for every mutation path.
4. Add cost guardrails and checkpoint recovery as first-class runtime systems.

## Phase Order (Authoritative)
0. Security Foundation
1. Approval Hub UI (always visible)
2. Dashboard Shell (progressive layers)
3. Repo and Task Navigation (no CLI dependencies)
4. Multi-Agent Orchestration with transaction wrappers
5. Workflow Visualization modal
6. Model Manager with cost guardrails
7. Skills Registry and Advanced Control Room
8. Diff Review and Transactional Rollback UX
9. Checkpoint and Resume UX
10. Final polish (motion, empty/error states, enterprise finish)

## Phase 0 Scope (Next Build Phase)
### Security Foundation deliverables
1. Secrets vault service abstraction:
- Provider order: system keychain first, encrypted SQLite fallback.
- Secret reference syntax support with tokenized handles.
- Auto-lock timeout and re-auth hooks.
2. Agent safety harness:
- Role-based tool allowlists with schema validation.
- Hard timeout and memory limits.
- Domain egress allowlist.
- Filesystem jail boundaries.
3. Audit database foundation:
- Append-only audit entries for secret access, approvals, tool invocations, policy denials, and mutations.
- Queryable APIs for dashboard audit viewer.
4. Re-auth triggers:
- Push to remote
- High-cost API call threshold
- Tool escalation attempts

## Required Technical Milestones for Phase 0 Exit
1. No plaintext secret values in runtime logs.
2. Every secret read generates audit entry.
3. Harness blocks at least one forbidden tool and one forbidden path in test.
4. Re-auth challenge appears for protected actions.
5. Security smoke tests pass.

## Acceptance Gate Mapping (From Directive)
- Every write requires approval: begin with mutation gateway interface and policy checks in Phase 0.
- Secrets never exposed: enforce tokenized secret references and output redaction.
- Agents cannot self-escalate: deny dynamic tool expansion and log policy denial.
- Crash recovery, rollback, budget hard stops: staged for phases 8 and 9 but data contracts seeded now.

## Engineering Plan for Immediate Execution (If Approved)
1. Add vault module + provider interface under backend app package.
2. Add security policy layer and tool permission schema under worker package.
3. Add audit schema migration and minimal read endpoints.
4. Add approval-required mutation gateway for worker write actions.
5. Add tests for tokenized secrets, policy denials, and audit write coverage.
6. Add dashboard placeholders for Layer 0 approval lock-state and security status badges.

## Phase 0 Implementation Summary
Implemented in this approved phase:
1. Encrypted vault service with tokenized secret handles and auto-lock behavior.
2. Vault API endpoints under /api/v1/vault (status, unlock, lock, reauth, secret tokenization).
3. Audit log database model and /api/v1/audit/events endpoint.
4. Runtime secret resolution support for provider health and GitHub operations.
5. Re-auth enforcement hook before remote push/PR action when enabled.
6. Worker tool-harness hardening:
- strict tool argument schema validation
- blocked shell metacharacter chaining
- memory ceiling enforcement for bash execution on POSIX
7. Settings write hardening against control-character injection in .env updates.

Validation:
1. Static diagnostics: no reported file errors.
2. Test suite: 30 passed, 12 skipped.

## Phase 1 Implementation Summary (Completed)
Implemented in this approved phase:

### Layer 0: ApprovalHub Component
**File**: `apps/dashboard/src/components/ApprovalHub.jsx`
**Purpose**: Always-visible approval gate at bottom of screen
**Features**:
- Fixed position at bottom, never scrolls away
- Shows highest-priority pending approval
- Minimizable header with risk-level color coding
- Structured action buttons (Approve, Reject, Modify)
- Displays cost estimate, blast radius, and action context
- Modify mode for structured feedback
- Auto-polling for new approvals (3-second interval)
- Graceful "all approvals current" message when idle

### Layer 1: ActivityFeed Component  
**File**: `apps/dashboard/src/components/ActivityFeed.jsx`
**Purpose**: Collapsible event log on left side
**Features**:
- Fixed left sidebar with minimize/expand toggle
- Shows last 50 audit events (from Phase 0)
- Event types: approval decisions, task status changes, policy denials, secret access
- Color-coded event icons by operation type
- Hover effects for drill-down
- Relative timestamps (e.g., "2m ago")
- Auto-loads every 10 seconds (Phase 0 audit endpoint ready for integration)

### Layer 2: WorkflowCanvas Component
**File**: `apps/dashboard/src/components/WorkflowCanvas.jsx`
**Purpose**: Modal showing multi-agent orchestration graph
**Features**:
- Modal overlay showing 4-phase agent orchestration
- Phases: Planner → Implementer → Tester → Reviewer
- Each phase shows: icon, name, role, status, duration, subtask count
- Phase details with log output below
- Click phase to drill down
- Status colors: green (completed), orange (in-progress), gray (pending), red (failed)
- Ready for Phase 4 (Multi-Agent Orchestration) integration

### Layer 3: ControlRoom Component
**File**: `apps/dashboard/src/components/ControlRoom.jsx`
**Purpose**: Advanced control panel modal
**Features**:
- Tabbed interface: Settings, Vault, Audit Log, Guardrails, Models
- Settings tab: auto-lock timeout, re-auth window, re-auth enforcement toggle
- Vault tab: displays vault locked/unlocked status + secret count (Phase 0 integration ready)
- Audit Log tab: displays audit events with actor and timestamp (Phase 0 integration ready)
- Guardrails tab: daily cost limit, per-task limit, cost progress bar
- Models tab: model selection with pricing
- Save & Close button

### LayerContext Provider
**File**: `apps/dashboard/src/context/LayerContext.jsx`
**Purpose**: Centralized state management for 4 layers
**Features**:
- `useLayers()` hook for accessing layer state
- `toggleLayer()`: show/hide layer
- `toggleMinimize()`: minimize/expand collapsible layers
- `showModal()`, `hideModal()`: control modal layers
- Initial state: Layer 0 always visible, Layer 1 visible but minimized, Layers 2-3 hidden

### App.jsx Integration
**Updates**:
- Imported `LayerProvider`, `ApprovalHub`, `ActivityFeed`, `WorkflowCanvas`, `ControlRoom`
- Wrapped entire app with `<LayerProvider>`
- Added padding-bottom to Layout for ApprovalHub clearance
- Rendered all 4 layer components in Layout (always active, visibility controlled by LayerContext)

### Validation Status
- All 4 components created and integrated
- No build errors (React/JSX syntax valid)
- LayerContext properly initialized
- Ready for Phase 0 backend integration (vault, audit endpoints)
- Ready for Phase 4 multi-agent orchestration data flow

## Phase 2 Implementation Summary (Completed)
Implemented in this approved phase:

### GlobalSearch Component
**File**: `apps/dashboard/src/components/GlobalSearch.jsx`
**Purpose**: Cross-project discovery without CLI
**Features**:
- Searchable modal overlay with real-time results
- Search across projects, tasks, and approvals
- Scope filters: All, Projects only, Tasks only, Approvals only
- Shows 50 results max with type indicator
- Click result to navigate directly
- Keyboard-friendly (start typing, enter to select)

### QueueManager Component
**File**: `apps/dashboard/src/components/QueueManager.jsx`
**Purpose**: Task queue visualization with priority controls
**Features**:
- Shows queued/pending/planning tasks in priority order
- Drag-to-reorder for priority management
- Per-task pause/resume controls
- Cancel button with reason support
- Progress bar visualization
- #1, #2 priority indicators
- Risk level and project references

### TaskTemplates Component
**File**: `apps/dashboard/src/components/TaskTemplates.jsx`
**Purpose**: Guided task creation without CLI (5 templates)
**Templates**:
1. Bug Fix - structured issue documentation
2. Feature Development - feature requirements template
3. Refactoring - code improvement structure
4. Testing - test scenario template
5. Documentation - docs and comments template
**Features**:
- Step 1: Choose template with icon preview
- Step 2: Guided form with title, description, acceptance criteria, test plan
- Risk level and priority selectors
- Creates task and navigates to detail view
- Prefilled templates for each type

### RepoPickerModal Component
**File**: `apps/dashboard/src/components/RepoPickerModal.jsx`
**Purpose**: Enhanced GitHub repository discovery
**Features**:
- Searchable repository browser
- Filters: by name/description, language, star count (0-10, 10-50, 50-100, 100+)
- Shows repo description, language, stars, last update
- Quick connect button for each repo
- Handles auth failures gracefully
- Async repository loading

### Home Page Integration (Phase 2 Edition)
**File**: `apps/dashboard/src/pages/Home.jsx` (enhanced)
**Updates**:
- Integrated QueueManager component (shows task queue if tasks pending)
- Added 3 quick-nav buttons:
  - 🔍 Global Search (modal overlay)
  - ✨ New Task (template selector)
  - 🔗 Browse Repos (repo picker)
- Buttons have hover effects and proper styling
- Modals render over main content with proper z-indexing
- All components ready for Phase 0 backend integration

### Navigation Flow (No CLI Required)
1. **Dashboard Home** → Quick nav buttons visible
2. **Global Search** → Find projects/tasks/approvals by keyword
3. **New Task** → Choose template → Fill form → Task created
4. **Browse Repos** → Filter and search → Connect GitHub repo
5. **Queue Manager** → Drag tasks, pause/resume, cancel

### Validation Status
- All 4 new components created: 0 errors
- Home page updated with Phase 2 features: 0 errors  
- Backend tests: 30 passed, 12 skipped (unchanged)
- No breaking changes to existing functionality

## Next Phase Approval Checkpoint
## Phase 3 Implementation Summary (Completed)

**Scope**: Multi-agent workflow orchestration with atomic transactions and rollback capability.

**Deliverables**:

### 3.1 Orchestration Data Models
**File**: `apps/api/app/models.py` (additions)
**Components**:
- `AgentPhase` model: Tracks each agent (planner/implementer/tester/reviewer) state and execution
  - Fields: id, task_id, phase_type, status, started_at, completed_at, duration
  - Context/output fields for phase input and results
  - Checkpoint state for rollback support
- `OrchestrationLog` model: Audit trail of phase transitions
  - Fields: id, task_id, actor, operation, source_phase, target_phase, status, details
- Enums: `AgentPhaseType` (PLANNER, IMPLEMENTER, TESTER, REVIEWER)
- Enums: `AgentPhaseStatus` (PENDING, IN_PROGRESS, COMPLETED, FAILED, ROLLED_BACK)
- Enums: `OrchestrationOperation` (PHASE_STARTED, PHASE_COMPLETED, PHASE_FAILED, HANDOFF, ROLLBACK, CHECKPOINT)

### 3.2 Transaction Wrapper System
**File**: `apps/api/app/security/transactions.py` (new)
**Components**:
- `Checkpoint` class: Savepoint with state data for rollback
- `TransactionLog` class: In-memory operation log with checkpoint tracking
- `TransactionWrapper` class: Main orchestration transaction manager
  - Methods: begin_phase(), create_checkpoint(), complete_phase(), fail_phase()
  - Methods: rollback_to_checkpoint(), handoff_to_phase(), commit()
  - Supports replay from checkpoint for recovery
- `TransactionState` enum: ACTIVE, COMMITTED, ROLLED_BACK, FAILED

### 3.3 AgentOrchestrator Service
**File**: `apps/api/app/services/orchestration.py` (new)
**Components**:
- `AgentOrchestrator` class: Core orchestration engine
  - 4-phase workflow: PLANNER → IMPLEMENTER → TESTER → REVIEWER
  - Prerequisite validation before phase execution
  - initialize_workflow(): Creates AgentPhase records
  - check_prerequisites(): Validates phase dependencies
  - start_phase(), complete_phase(), fail_phase(): Phase lifecycle
  - handoff_to_next_phase(): Automatic phase progression
  - get_workflow_status(): Real-time status tracking
  - rollback_from_phase(): Rollback with audit logging
  - begin_transaction(), commit_transaction(): Transaction lifecycle
  - _log_orchestration(): OrchestrationLog audit trail

### 3.4 REST API Endpoints
**File**: `apps/api/app/routes/orchestration.py` (new)
**Endpoints**:
- `GET /api/v1/tasks/{task_id}/orchestration/phases` - List all phases for task
- `GET /api/v1/tasks/{task_id}/orchestration/status` - Current workflow status
- `POST /api/v1/tasks/{task_id}/orchestration/phases/{phase_type}/complete` - Complete phase
- `POST /api/v1/tasks/{task_id}/orchestration/phases/{phase_type}/fail` - Fail phase
- `GET /api/v1/tasks/{task_id}/orchestration/log` - Orchestration audit trail
- `POST /api/v1/tasks/{task_id}/orchestration/rollback` - Rollback from phase
- `POST /api/v1/tasks/{task_id}/orchestration/initialize` - Initialize workflow

### 3.5 Task Execution Integration
**File**: `apps/api/app/routes/tasks.py` (additions)
**Endpoints Added**:
- `POST /tasks/{task_id}/orchestration/enable` - Enable multi-phase orchestration
- `POST /tasks/{task_id}/orchestration/start-phase` - Start phase with context
- Both endpoints handle logging, SSE broadcasts, and error handling

**Integration Pattern**:
- Orchestration optional per-task via `/orchestration/enable`
- Independent from legacy single-phase task execution
- Orchestration can wrap existing approval/diff review workflow
- Audit trail automatically populated in OrchestrationLog

### 3.6 Main Application Integration
**File**: `apps/api/app/main.py` (updates)
**Changes**:
- Import orchestration router
- Added `app.include_router(orchestration.router)` to include endpoints

### Validation Status
- All 5 new components created with full error checking: 0 errors
- 2 existing files enhanced (tasks.py, main.py): 0 errors  
- Backend tests: 30 passed, 12 skipped (unchanged - no regressions)
- No breaking changes to existing functionality
- All models properly indexed for query performance (task_id, status, phase_type)

### Architecture Pattern: 4-Phase Workflow
```
Task Approval
  ↓
PLANNER Phase (analyzes requirements, creates plan)
  ├─ Prerequisite: none
  ├─ Checkpoint created after analysis
  └─ Handoff to Implementer
  ↓
IMPLEMENTER Phase (writes code based on plan)
  ├─ Prerequisite: PLANNER completed
  ├─ Checkpoint created after code generation
  └─ Handoff to Tester
  ↓
TESTER Phase (validates implementation)
  ├─ Prerequisite: PLANNER + IMPLEMENTER completed
  ├─ Checkpoint created after test execution
  └─ Handoff to Reviewer
  ↓
REVIEWER Phase (final review and approval)
  ├─ Prerequisite: All prior phases completed
  ├─ Generates final report
  └─ Completes workflow
  ↓
Workflow Complete
```

### Transaction & Rollback Model
- Each phase can create multiple checkpoints during execution
- Rollback available to any prior checkpoint (within same transaction)
- All state transitions logged in OrchestrationLog with actor/timestamp/details
- Atomic operations: either all phases complete or rollback to known good state
- Replay capability: restart from checkpoint with prior state restored
- Checkpoint data includes: phase inputs, intermediate results, error states

## Phase 4 Implementation Summary (Completed)

**Scope**: Real-time workflow visualization for multi-agent orchestration in Layer 2 UI.

### 4.1 Live Workflow Canvas
**File**: `apps/dashboard/src/components/WorkflowCanvas.jsx` (updated)
**Changes**:
- Replaced static mock phase data with live backend integration.
- Added orchestration fetch pipeline:
  - `GET /api/v1/tasks/{task_id}/orchestration/phases`
  - `GET /api/v1/tasks/{task_id}/orchestration/status`
  - `GET /api/v1/tasks/{task_id}/orchestration/log`
- Added periodic refresh (10s polling) and SSE-triggered refresh for selected task.
- Added task picker when no task is selected for Layer 2.
- Added phase-level detail panel with operation timeline, duration, and status.
- Added workflow initialization action for tasks without initialized phases.

### 4.2 Dashboard Launch Integration
**Files**:
- `apps/dashboard/src/pages/Home.jsx` (updated)
- `apps/dashboard/src/pages/TaskDetail.jsx` (updated)
- `apps/dashboard/src/context/LayerContext.jsx` (updated)

**Changes**:
- Added `View Workflow` action on active task cards in Home.
- Added `View Workflow Graph` action in Task Detail.
- Extended Layer 2 context state to carry modal task context (`taskId`).
- Extended `showModal(layerId, options)` to pass per-modal payloads.

### 4.3 Frontend API Surface for Orchestration
**File**: `apps/dashboard/src/api.js` (updated)
**Added methods**:
- `tasks.orchestrationInitialize(taskId)`
- `tasks.orchestrationPhases(taskId)`
- `tasks.orchestrationStatus(taskId)`
- `tasks.orchestrationLog(taskId, limit, offset)`
- `tasks.orchestrationRollback(taskId, fromPhase)`
- `tasks.orchestrationCompletePhase(taskId, phaseType, output)`
- `tasks.orchestrationFailPhase(taskId, phaseType, error)`
- `tasks.enableOrchestration(taskId)`
- `tasks.startOrchestrationPhase(taskId, phaseType, context)`

### 4.4 SSE Event Coverage
**File**: `apps/dashboard/src/useSSE.js` (updated)
**Added event subscriptions**:
- `orchestration_enabled`
- `phase_started`
- `phase_completed`
- `phase_failed`

### Validation Status
- Frontend diagnostics: 0 errors in all updated Phase 4 files.
- Backend regression tests: 30 passed, 12 skipped (unchanged).
- No breaking changes to existing routes or existing task/detail flows.

## Next Phase Approval Checkpoint
Current branch remains feature/phase2-items-1-4.

## Phase 5 Implementation Summary (Completed)

**Scope**: Runtime-backed model manager and cost guardrails in Control Room with persistent settings.

### 5.1 Backend Cost Guardrail Configuration
**File**: `apps/api/app/config.py` (updated)
**Added settings**:
- `daily_cost_limit_usd`
- `task_cost_limit_usd`
- `enforce_cost_limits`

### 5.2 Runtime Status and Settings Persistence
**File**: `apps/api/app/routes/system.py` (updated)
**Changes**:
- Added active model resolution in runtime diagnostics (`active_model`).
- Exposed security controls in runtime status:
  - `vault_auto_lock_seconds`
  - `reauth_window_seconds`
  - `require_reauth_for_remote_push`
- Exposed cost guardrail block in runtime status:
  - `daily_cost_limit_usd`
  - `task_cost_limit_usd`
  - `enforce_cost_limits`
- Extended settings update schema to persist:
  - `DAILY_COST_LIMIT_USD`
  - `TASK_COST_LIMIT_USD`
  - `ENFORCE_COST_LIMITS`
  - `VAULT_AUTO_LOCK_SECONDS`
  - `REAUTH_WINDOW_SECONDS`
  - `REQUIRE_REAUTH_FOR_REMOTE_PUSH`
- Added float reload handling when applying `.env` changes in-process.

### 5.3 Frontend API Wiring
**File**: `apps/dashboard/src/api.js` (updated)
**Added methods**:
- `system.getAuditEvents(limit)`
- `system.getVaultStatus()`

### 5.4 Control Room: Live Model Manager + Guardrails
**File**: `apps/dashboard/src/components/ControlRoom.jsx` (updated)
**Changes**:
- Replaced static tab content with runtime-backed form state.
- Loads runtime status, vault status, and audit logs when opened.
- Settings tab now saves:
  - auto-lock timeout
  - re-auth window
  - re-auth-for-remote-push toggle
- Guardrails tab now saves:
  - daily cost limit
  - per-task cost limit
  - enforce hard-stop toggle
- Models tab now supports provider selection and active model selection with persistence.
- `Save & Close` now persists all control room settings to backend.

### Validation Status
- Frontend diagnostics: 0 errors in updated Phase 5 files.
- Backend regression tests: 30 passed, 12 skipped.
- Frontend production build: successful (`vite build`).
- No regressions to existing dashboard routes or orchestration features.

## Next Phase Approval Checkpoint
Current branch remains feature/phase2-items-1-4.

Phase 5 (Model Manager with cost guardrails) implementation **COMPLETE**.

## Phase 6 Implementation Summary (Completed)

**Scope**: Skills Registry backend and advanced Control Room skill operations.

### 6.1 Backend Skills Registry
**Files**:
- `apps/api/app/models.py` (updated)
- `apps/api/app/routes/skills.py` (new)
- `apps/api/app/main.py` (updated)

**Changes**:
- Added `Skill` model with governance controls:
  - `slug`, `name`, `description`, `category`, `enabled`
  - `required_approval`, `max_risk_level`
  - `tool_allowlist`, `skill_config`
- Added `SkillCategory` enum for registry organization:
  - planning, implementation, testing, review, operations
- Added authenticated Skills Registry API endpoints:
  - `GET /api/v1/skills` (list with optional filters)
  - `POST /api/v1/skills` (create)
  - `PUT /api/v1/skills/{skill_id}` (update)
  - `POST /api/v1/skills/{skill_id}/toggle` (enable/disable)
  - `DELETE /api/v1/skills/{skill_id}` (remove)
- Added slug validation and conflict checks to prevent invalid/duplicate skill definitions.

### 6.2 Advanced Control Room: Skills Tab
**Files**:
- `apps/dashboard/src/api.js` (updated)
- `apps/dashboard/src/components/ControlRoom.jsx` (updated)

**Changes**:
- Added frontend Skills API client methods:
  - `skills.list`, `skills.create`, `skills.update`, `skills.toggle`, `skills.remove`
- Added new `🧩 Skills` tab to Control Room.
- Added live skill list with governance context (category, max risk, approval mode).
- Added create-skill form with:
  - slug, name, description
  - category selector
  - max risk selector
  - requires-approval toggle
- Added inline enable/disable and delete actions with live refresh.

### Validation Status
- Backend diagnostics: clean in modified files.
- Frontend diagnostics: clean in modified files.
- API route registration completed and app startup path updated.

## Next Phase Approval Checkpoint
Current branch remains feature/phase2-items-1-4.

Phase 6 (Skills Registry and Advanced Control Room) implementation **COMPLETE**.

## Phase 7 Implementation Summary (Completed)

**Scope**: Diff review + transactional rollback UX, plus advanced skills registry operability updates.

### 7.1 Workflow Diff Review and Rollback UX
**File**: `apps/dashboard/src/components/WorkflowCanvas.jsx` (updated)

**Changes**:
- Added live Diff Review panel in Layer 2 using task artifact fetch (`diff`).
- Added rollback control bound to current selected phase:
  - Uses `POST /api/v1/tasks/{task_id}/orchestration/rollback?from_phase={phase}`
  - Refreshes workflow state after rollback
- Added rollback loading/error handling in modal.

### 7.2 Skills Registry Inline Editing
**File**: `apps/dashboard/src/components/ControlRoom.jsx` (updated)

**Changes**:
- Added inline edit mode for each skill row in Skills tab.
- Added edit form controls for:
  - name
  - description
  - category
  - max risk level
  - approval requirement
- Added save/cancel UX and API update integration.

### 7.3 Default Skill Seeding
**File**: `apps/api/app/routes/skills.py` (updated)

**Changes**:
- Added automatic default skill seeding when registry is empty.
- Seeded skills include:
  - `repo-policy-check`
  - `plan-quality-gate`
  - `diff-risk-scorer`
- Ensures first-time operators can use Skills tab without manual bootstrap.

### Validation Status
- Backend diagnostics: clean in changed files.
- Frontend diagnostics: clean in changed files.
- Backend tests: `30 passed, 12 skipped`.
- Frontend build: successful (`vite build`).

## Next Phase Approval Checkpoint
Current branch remains feature/phase2-items-1-4.

Phase 7 (Diff Review and Transactional Rollback UX) implementation **COMPLETE**.

## Phase 8 Implementation Summary (Completed)

**Scope**: Checkpoint inventory and resume controls for orchestration recovery workflows.

### 8.1 Backend Checkpoint and Resume API
**File**: `apps/api/app/routes/orchestration.py` (updated)

**Changes**:
- Added `GET /api/v1/tasks/{task_id}/orchestration/checkpoints`:
  - Aggregates explicit transaction checkpoints from phase `checkpoint_state`.
  - Adds synthetic phase snapshots for completed/rolled-back phases.
  - Returns normalized checkpoint records sorted by most recent timestamp.
- Added `POST /api/v1/tasks/{task_id}/orchestration/resume`:
  - Accepts `checkpoint_id`.
  - Locates checkpoint source phase and resets downstream phases to `pending`.
  - Clears downstream execution state (`started_at`, `completed_at`, `duration`, `error`, `output`).
  - Emits orchestration log entry with resume metadata.

### 8.2 Frontend API Surface for Resume UX
**File**: `apps/dashboard/src/api.js` (updated)

**Added methods**:
- `tasks.orchestrationCheckpoints(taskId)`
- `tasks.orchestrationResume(taskId, checkpointId)`

### 8.3 Workflow Canvas: Checkpoint and Resume Controls
**File**: `apps/dashboard/src/components/WorkflowCanvas.jsx` (updated)

**Changes**:
- Added checkpoint loading to orchestration data pipeline.
- Added checkpoint selector panel with source + timestamp context.
- Added resume action button wired to backend resume endpoint.
- Added resume loading and error-state handling.
- Added checkpoint state synchronization on periodic refresh/SSE updates.

### Validation Status
- Backend diagnostics: clean in changed route file.
- Frontend diagnostics: clean in updated UI/API files.
- Backend tests: `30 passed, 12 skipped`.
- Frontend build: successful (`vite build`).

Phase 8 (Checkpoint and Resume UX) implementation **COMPLETE**.

Approval options:
1. Proceed to Phase 9 (Final polish: motion, empty/error states, enterprise finish).
2. Request edits to Phase 8 before Phase 9.
3. Review Phase 8 checkpoint/resume UX and provide feedback.

## Phase 9 Kickoff Notes (In Progress)

Current implementation pass started with:
- Dashboard and approvals polish for clearer loading/empty/error states.
- Structured modify-request UX in approvals to reduce free-form prompt friction.
- Lightweight motion and surface styling for smoother operator experience.

Validation is run after each edit batch with backend tests and frontend production build.

## Phase 9 Implementation Summary (Completed)

**Scope**: Final polish for enterprise-readiness UX with motion, trust signals, and incident clarity.

### 9.1 Motion + Surface Foundation
**File**: `apps/dashboard/src/main.jsx` (updated)

**Changes**:
- Added reusable surface, alert, skeleton, and empty-state CSS tokens/classes.
- Added subtle page-enter and shimmer motion for faster perceived responsiveness.
- Standardized visual language for high-signal operational panels.

### 9.2 Structured Approval Review Confidence
**Files**:
- `apps/dashboard/src/components/ApprovalCard.jsx` (updated)
- `apps/dashboard/src/pages/Approvals.jsx` (updated)

**Changes**:
- Added confidence model indicators on approval cards:
  - confidence percentage/band
  - blast radius estimate
  - changed files count
- Added risk-accented card framing to improve triage speed.
- Added structured modify-request UX in approvals page:
  - reason-code selector
  - required reviewer-guidance field
  - explicit modal flow replacing free-form prompt input.
- Added polished loading/empty/error states for approval operations.

### 9.3 Incident Handling Clarity in Dashboard
**File**: `apps/dashboard/src/pages/Home.jsx` (updated)

**Changes**:
- Added Operator Snapshot metrics panel:
  - active tasks
  - pending approvals
  - high-risk task count
  - queue backlog count
- Added Incident Timeline panel for event triage with relative time and risk tinting.
- Upgraded loading/empty/error states across worker/task/approval sections.

### Validation Status
- Frontend diagnostics: clean in changed UI files.
- Backend tests: `30 passed, 12 skipped`.
- Frontend build: successful (`vite build`).

Phase 9 (Final polish) implementation **COMPLETE**.

Approval options:
1. Request final adjustments before PR packaging.
2. Proceed to PR-ready cleanup and summary.
3. Begin next roadmap phase definition.
