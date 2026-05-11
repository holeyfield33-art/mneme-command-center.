# Mneme Command Center

Local-first autonomous coding command center with human approvals, live observability, and hardened execution controls.

## What Mneme Is

Mneme provides a complete local command center for running software-engineering tasks safely:

- Create tasks from a mobile-friendly dashboard
- Route work through API + worker orchestration
- Review approvals and logs in real time via SSE
- Enforce security boundaries (vault controls, budget controls, sandbox mode)
- Track orchestration phases and rollback points
- Select model provider/model per task

## Repository Depth (Current Scope)

This repository now includes full-stack capabilities across API, dashboard, worker, security, orchestration, and integration testing.

### 1. API Layer (`apps/api`)

- FastAPI service with auth, projects, tasks, approvals, worker routes, system routes
- SSE event stream + event broadcasting
- Security controls:
  - Vault lock + auto-lock settings
  - Re-auth sensitive operation gates
  - Emergency stop flagging
- Orchestration endpoints:
  - Phase initialization and status
  - Checkpoint listing
  - Rollback + resume
- Cost telemetry endpoint for task-level token/cost summaries
- Skills registry endpoints for skill metadata and activation

### 2. Dashboard Layer (`apps/dashboard`)

- React + Vite single-page app
- Real-time update model (SSE-first; polling removed in critical flows)
- Approval workflow UI:
  - Approval hub
  - Audit timeline
  - Context and risk display
- Workflow orchestration UI:
  - Phase graph/status
  - Checkpoint controls
  - Rollback actions
- Task operations:
  - Task creation templates
  - Voice input
  - Per-task model provider/model override
  - Cost & usage visibility
- UX hardening:
  - Global error boundary
  - Theme token system + dark mode support

### 3. Worker Layer (`worker`)

- Task polling and status transitions
- Agentic tool-use loop (`worker/llm_client.py`) with provider adapters:
  - Anthropic
  - OpenAI
  - Google
  - Ollama (local/cloud via base URL)
- Safe execution controls:
  - Bash allowlist and blocked shell token policy
  - Docker sandbox execution mode for bash tool
  - Memory/cpu/pid/network controls in sandbox mode
- Reliability:
  - Checkpoint persistence + recovery
  - Notifications integration
- Cost guardrails:
  - Token estimation
  - Per-model cost estimation
  - Budget stop via `AGENT_BUDGET_USD`
- Secret-safety logging:
  - Centralized redaction for known keys and token patterns before logging

### 4. Security & Governance

- Vault auto-lock cap enforcement
- Emergency stop end-to-end behavior
- Skills metadata integration into agent prompt context
- Re-auth window config for sensitive routes
- Log redaction hardening for API/provider token leak prevention

### 5. Tests & Validation (`tests`)

- Local unit/integration suite (non-live)
- Live API integration suite guarded by env flags
- Worker-enabled live checks for heartbeat/status flow
- Notification, planning, orchestration, and worker execution path tests

## Architecture

```text
Dashboard (React/Vite)
  │
  │ HTTP + SSE
  ▼
FastAPI Backend (SQLite)
  │
  │ HTTP coordination
  ▼
Worker (Python)
  ├─ Repo planning + execution orchestration
  ├─ Provider adapters (Anthropic/OpenAI/Google/Ollama)
  └─ Sandboxed tool execution + cost governance
```

## Key Features (Current)

- Real-time dashboard updates through SSE
- Approval-centric execution model with explicit human gate
- Multi-phase orchestration with checkpoints + rollback/resume
- Per-task model routing and provider override
- Task-level cost reporting + budget-based stop behavior
- Docker sandbox mode for command execution path
- Secret redaction before logging provider/API failures
- Dark-mode compatible theme tokens and modernized component styling

## Setup

### 1. Initialize env files

```bash
cd /workspaces/mneme-command-center.
./env/init.sh
```

### 2. Configure `.env`

Set at minimum:

- `MNEME_ADMIN_PASSWORD`
- `MODEL_PROVIDER`
- provider-specific keys/models as needed
- `AGENT_BUDGET_USD` (recommended)
- `AGENT_SANDBOX_MODE` (`process` or `docker`)

### 3. Start API

```bash
cd /workspaces/mneme-command-center.
set -a && source .env && set +a
/workspaces/mneme-command-center./.venv/bin/python apps/api/main.py
```

### 4. Start dashboard

```bash
cd /workspaces/mneme-command-center./apps/dashboard
npm install
npm run dev
```

### 5. Start worker

```bash
cd /workspaces/mneme-command-center.
set -a && source .env && set +a
/workspaces/mneme-command-center./.venv/bin/python -m worker.main
```

## Test Commands

### Baseline CI-equivalent checks

```bash
cd /workspaces/mneme-command-center.
/workspaces/mneme-command-center./.venv/bin/python -m pytest -q
cd apps/dashboard && npm run build
```

### Full live E2E suite

Run API first, then:

```bash
cd /workspaces/mneme-command-center.
set -a && source .env && set +a
MNEME_RUN_LIVE_TESTS=1 MNEME_RUN_WORKER_TESTS=1 /workspaces/mneme-command-center./.venv/bin/python -m pytest -v
```

## CI Pipeline (Phase 11)

GitHub Actions workflow: `.github/workflows/ci.yml`

Current jobs:

- `backend-tests`: installs API/worker deps and runs `pytest -q`
- `frontend-build`: runs `npm ci` + `npm run build` in dashboard
- `live-api-integration`: boots API, waits for `/health`, then runs live integration tests with:
  - `MNEME_RUN_LIVE_TESTS=1`
  - `MNEME_RUN_WORKER_TESTS=1`

This catches regressions where unit tests pass but runtime/API startup paths fail in CI.

## Notes

- Dashboard UI harness tests are intentionally skipped in pytest (`test_dashboard_dependent_checks_are_skipped`) and require dedicated UI automation if desired.
- For production-like hardening, keep `AGENT_BUDGET_USD` non-zero and `AGENT_SANDBOX_MODE=docker`.

## Additional Documentation

- [docs/SETUP.md](docs/SETUP.md)
- [docs/INSTALL_AND_RUN_MANUAL.md](docs/INSTALL_AND_RUN_MANUAL.md)
