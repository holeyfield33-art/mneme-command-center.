# Mneme Command Center - Phase 2

A single-user, local-first autonomous coding command center controlled from a phone dashboard.

## Overview

Mneme lets you:
- Create coding/research tasks from your phone
- Route them to a worker running on your laptop
- Watch tasks, logs, and approvals update live through SSE
- Review plan file previews directly in approval cards
- Recover worker progress after restart with checkpoints
- Create tasks faster with voice input and one-click templates

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Dashboard (React/Vite)                     │
│                   - List projects & tasks                    │
│                   - Live approvals, logs, task updates       │
│                   - Voice task creation + templates           │
│                   - Control emergency stop                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ (HTTP/JSON)
                  │
┌─────────────────▼───────────────────────────────────────────┐
│              FastAPI Backend (localhost:8000)                │
│ - SQLite database                                           │
│ - Admin password auth                                       │
│ - Projects, Tasks, Approvals, Logs                          │
│ - Worker coordination + SSE event streaming                 │
│ - Emergency stop                                            │
└─────────────────▲───────────────────────────────────────────┘
                  │
                  │ (HTTP)
                  │
┌─────────────────┴───────────────────────────────────────────┐
│            Worker (Python - localhost script)                │
│ - Polls API for queued tasks                                │
│ - Sends heartbeat every 30s                                 │
│ - Creates implementation plans                              │
│ - Requests approvals with plan file previews                │
│ - Stores/recovers checkpoints after crash                   │
│ - Respects emergency stop                                   │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Backend
```bash
cd apps/api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export MNEME_ADMIN_PASSWORD=mypassword
python main.py
```

### 2. Dashboard
```bash
cd apps/dashboard
npm install
npm run dev
```

Access at: `http://localhost:5173` (or `http://<laptop-ip>:5173` from phone)

### 3. Worker
```bash
cd worker
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

## Acceptance Criteria - All Met! ✓

- ✅ I can run backend locally
- ✅ I can run dashboard locally
- ✅ I can run worker locally
- ✅ I can open dashboard from my phone on the same network
- ✅ I can create a project
- ✅ I can create a task
- ✅ Worker picks up the task
- ✅ Logs appear in dashboard
- ✅ An approval card appears
- ✅ I can approve or reject the plan
- ✅ Emergency stop works
- ✅ Dashboard updates instantly without manual refresh
- ✅ Approval cards show file-level plan previews
- ✅ Worker resumes from checkpoints after restart
- ✅ Voice input can fill task description on mobile browsers
- ✅ Task templates prefill common task shapes

## New in Phase 2

- Real-time updates
    - API exposes SSE stream at /events
    - Worker and API broadcast state-change events
    - Dashboard auto-refreshes task, log, and approval views from events
- Approval diff previews
    - Worker derives structured plan_details from generated plan text
    - Approval model stores plan_details as JSON
    - Approval cards render collapsible file preview blocks
- Worker checkpoints
    - Persistent checkpoint file at /tmp/mneme_worker_state.json
    - Worker resumes from saved planning/execution steps
    - Checkpoint is cleared on terminal execution stage completion/failure
- Mobile task entry improvements
    - Microphone button uses SpeechRecognition/webkitSpeechRecognition
    - Task templates: Refactor, Add Tests, Document, Explain Code

## Full Documentation

See detailed setup, API reference, database schema, and troubleshooting in [docs/SETUP.md](docs/SETUP.md)

## Testing

Run tests with:

```bash
/home/codespace/.python/current/bin/python -m pytest -v
```

By default, only local non-live tests run. To run live integration tests against a running API, set `MNEME_RUN_LIVE_TESTS=1`.