# Mneme Command Center - Phase 1

A single-user, local-first autonomous coding command center controlled from a phone dashboard.

## Overview

Mneme lets you:
- Create coding/research tasks from your phone
- Route them to a worker running on your laptop
- View logs and approve plans
- Eventually run Claude Code against your local repos (Phase 2+)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Dashboard (React/Vite)                     │
│                   - List projects & tasks                    │
│                   - Show approvals & logs                    │
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
│ - Worker coordination                                       │
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
│ - Requests approvals                                        │
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

## Full Documentation

See detailed setup, API reference, database schema, and troubleshooting in [docs/SETUP.md](docs/SETUP.md)

## Testing

Run tests with:

```bash
/home/codespace/.python/current/bin/python -m pytest -v
```

By default, only local non-live tests run. To run live integration tests against a running API, set `MNEME_RUN_LIVE_TESTS=1`.