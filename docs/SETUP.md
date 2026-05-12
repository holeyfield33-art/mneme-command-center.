# Mneme Command Center - Complete Setup Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Backend Setup](#backend-setup)
3. [Dashboard Setup](#dashboard-setup)
4. [Worker Setup](#worker-setup)
5. [Unconstrained Branch Mode](#unconstrained-branch-mode)
6. [Ollama (Local Model) Setup](#ollama-local-model-setup)
7. [Running Tests](#running-tests)
8. [Usage Guide](#usage-guide)
9. [Dashboard Features](#dashboard-features)
10. [API Reference](#api-reference)
11. [Database Schema](#database-schema)
12. [Troubleshooting](#troubleshooting)

## Prerequisites

- Python 3.8+
- Node.js 18+
- SQLite (included with Python)
- Bash or compatible shell
- Same network connection (for phone access)

## Environment Files (Recommended)

Initialize environment files from the new `env/` folder:

```bash
cd /workspaces/mneme-command-center.
./env/init.sh
```

This creates:

- `.env` (API + worker configuration)
- `apps/dashboard/.env.local` (dashboard API URL)

Edit those files first, then continue with backend/dashboard/worker setup.

## Backend Setup

### Step 1: Create Virtual Environment

```bash
cd apps/api
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### Step 2: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 3: Configure Environment

Create a `.env` file in `apps/api/`:

```bash
MNEME_API_HOST=0.0.0.0
MNEME_API_PORT=8000
MNEME_ADMIN_PASSWORD=your-secure-password
MNEME_SECRET_KEY=your-secret-key-12345
MNEME_DATABASE_URL=sqlite:///./mneme.db
MNEME_ACCESS_TOKEN_MINUTES=720
```

Or set environment variables:

```bash
export MNEME_API_HOST=0.0.0.0
export MNEME_API_PORT=8000
export MNEME_ADMIN_PASSWORD=your-secure-password
export MNEME_SECRET_KEY=your-secret-key
```

### Step 4: Run the API

```bash
python main.py
```

Output:

```text
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Step 5: Verify

```bash
curl http://localhost:8000/health
# Response: {"status":"healthy"}
```

## Dashboard Setup

### Step 1: Install Dependencies

```bash
cd apps/dashboard
npm install
```

### Step 2: Configure (Optional)

Create `.env.local`:

```text
VITE_API_URL=http://localhost:8000
```

### Step 3: Start Development Server

```bash
npm run dev
```

Output:

```text
  VITE v5.0.8  ready in 123 ms
  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### Step 4: Access Dashboard

- **Local**: `http://localhost:5173`
- **From phone**: `http://<your-laptop-ip>:5173`

Find your laptop IP:

```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows
ipconfig | findstr IPv4
```

### Step 5: Login

Enter the password from `MNEME_ADMIN_PASSWORD` in your `.env` file.

## Worker Setup

### Worker Step 1: Create Virtual Environment

```bash
cd worker
python3 -m venv venv
source venv/bin/activate
```

### Worker Step 2: Install Dependencies

```bash
pip install -r requirements.txt
```

### Worker Step 3: Configure Environment

```bash
export MNEME_API_URL=http://localhost:8000
export MNEME_WORKER_ID=worker-1
export MNEME_HEARTBEAT_INTERVAL=30
export CLAUDE_CODE_COMMAND='claude --print --allowedTools "Edit,Write,Bash" {prompt_file}'
export CLAUDE_CODE_TIMEOUT_SECONDS=900
export CLAUDE_CODE_MAX_RETRIES=2
export CLAUDE_CODE_RETRY_DELAY_SECONDS=3
# Optional if your Claude CLI session is already authenticated
export ANTHROPIC_API_KEY=
# Optional; defaults to workspace plans directory
export CLAUDE_ARTIFACT_DIR=
```

Notes:

- The `CLAUDE_CODE_COMMAND` value supports `{prompt_file}` placeholder.
- If `{prompt_file}` is not present, the worker appends the prompt path automatically.
- Each run writes artifacts (`stdout`, `stderr`, metadata JSON) to the artifact directory for debugging.

### Step 4: Run the Worker

```bash
cd ..
set -a && source .env && set +a
python -m worker.main
```

Output:

```text
[INFO] Mneme Worker started
[INFO] Worker ID: worker-1
[INFO] Hostname: my-laptop
[INFO] API URL: http://localhost:8000
[INFO] Heartbeat interval: 30s
------------------------------------------------------------
[2024-01-15T10:30:45.123456] Heartbeat sent
[INFO] Found 0 queued tasks
```

## Unconstrained Branch Mode

Mneme does not ship with a permanent unconstrained branch. Unconstrained mode is an operator-created temporary feature branch with lower runtime isolation.

Create branch:

```bash
cd /workspaces/mneme-command-center.
git checkout main
git pull origin main
git checkout -b feature/unconstrained-$(date +%Y%m%d)-<topic>
```

Use these `.env` values on that branch only:

```env
AGENT_SANDBOX_MODE=process
AGENT_BUDGET_USD=0
```

Return to hardened mode after testing:

```env
AGENT_SANDBOX_MODE=docker
AGENT_BUDGET_USD=10
```

Full operating playbook: [docs/UNCONSTRAINED_BRANCH_OPERATIONS.md](docs/UNCONSTRAINED_BRANCH_OPERATIONS.md)

## Ollama (Local Model) Setup

Mneme supports routing tasks to a locally-hosted Ollama model so no cloud API key is needed.

### Step 1: Install Ollama

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# Or download from https://ollama.com/download
```

### Step 2: Pull a coding model

```bash
# Recommended for code tasks:
ollama pull qwen2.5-coder

# Alternatives:
ollama pull codestral
ollama pull llama3.1
ollama pull mistral
```

### Step 3: Start Ollama server

By default Ollama listens on `http://localhost:11434`. Start it with:

```bash
ollama serve
```

Verify it is running:

```bash
curl http://localhost:11434/api/tags
# Should return a JSON list of installed models
```

### Step 4: Configure the worker to use Ollama

Set these environment variables before starting the worker:

```bash
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=qwen2.5-coder       # or whichever model you pulled
```

If Ollama is on a different machine (e.g. a local GPU server):

```bash
export OLLAMA_BASE_URL=http://192.168.1.50:11434
```

### Step 5: Set the project model in the dashboard

1. Open the dashboard → navigate to your project
2. Under **Model Override**, uncheck "Inherit global provider and model"
3. Set **Provider** to `ollama`
4. Set **Model** to the name of the model you pulled (e.g. `qwen2.5-coder`)
5. Click **Save**

All new tasks for that project will now be routed to your local Ollama instance.

### Notes

- Ollama models run entirely on your hardware — no API key required.
- `qwen2.5-coder` (7B) is the recommended starting point for code tasks; use a 13B+ model if you have ≥16 GB VRAM.
- Ollama must be reachable from the machine running the worker (same host is easiest).
- For GPU acceleration, Ollama auto-detects CUDA/Metal; no extra configuration needed.

## Running Tests

```bash
/home/codespace/.python/current/bin/python -m pytest -v
```

Default test runs include local non-live tests only.

To run live API integration tests against a running backend:

```bash
MNEME_RUN_LIVE_TESTS=1 /home/codespace/.python/current/bin/python -m pytest -v
```

To include worker-dependent live checks as well:

```bash
MNEME_RUN_LIVE_TESTS=1 MNEME_RUN_WORKER_TESTS=1 /home/codespace/.python/current/bin/python -m pytest -v
```

## Usage Guide

### Complete Workflow

1. **Login to Dashboard**
  Use `http://localhost:5173` on laptop and `http://192.168.1.100:5173` on phone.

2. **Create a Project**
   - Navigate to "Projects" tab
   - Click "Add Project"
   - Fill in:
     - Project Name: `my-awesome-project`
     - Repo Path: `/Users/me/projects/my-awesome-project`
     - Repo URL: `https://github.com/me/my-awesome-project`
     - Default Branch: `main`
   - Click "Create Project"

3. **Create a Task**
   - Click on the project
   - Click "Create Task"
   - Fill in:
     - Objective: `Add user authentication to the login page`
     - Mode: `interactive` (worker needs approval)
     - Risk Level: `medium`
   - Click "Create Task"
   - Task status: `queued`

4. **Worker Processes Task**
   - Worker polls every 5 seconds
   - Finds queued task
   - Marks task as `planning`
   - Generates implementation plan
   - Creates approval request
   - Task status: `waiting_for_plan_approval`

5. **Review Plan**
   - Navigate to "Approvals" tab
   - Review the implementation plan
   - Plan shows:
     - Objective
     - Files to modify
     - Implementation strategy
     - Validation approach

6. **Approve or Reject**
   - Click "✓ Approve" to proceed
   - Task status: `plan_approved`
   - (Or click "✕ Reject" to stop)

7. **View Logs**
   - Click on task to see full logs
   - Logs show:
     - Planning progress
     - Plan generation
     - Approval requests
     - Worker activity

### Emergency Stop

1. Click the "🛑 Emergency Stop" button in dashboard
2. Worker will gracefully stop processing
3. Click again to clear emergency stop
4. Worker will resume processing

## Dashboard Features

### Approvals Queue (`/approvals`)

| Feature | Description |
| --- | --- |
| **SLA Timer** | Live countdown per approval based on risk level (High: 2h, Medium: 8h, Low: 24h) |
| **Urgency Sort** | High-risk approvals always appear first, then oldest-first within each tier |
| **Queue Summary** | Strip above the queue showing total / high / medium / low counts |
| **Audit Timeline** | Chronological log of every approve / reject / modify action |
| **Decision Brief** | Auto-generated context panel with recommended action per approval |
| **Role Summaries** | Persona toggle (Operator / Reviewer / Manager) with tailored guidance |
| **Incident Mode** | Toggle to filter by High Risk / Overdue SLA / Both; shows overdue count |
| **Bulk Actions** | Checkbox-select visible approvals and approve/reject in one click |
| **Modify Request** | Structured modify modal with reason code + reviewer guidance, persisted to audit log |
| **Backlog Correlation** | Panel grouping pending approvals by project to identify the biggest blockers |

### Project Detail (`/projects/:id`)

| Feature | Description |
| --- | --- |
| **Task Pipeline Graph** | SVG DAG showing all tasks in creation order with status colours, approval gate diamonds, and click-to-navigate |
| **Model Override** | Set a per-project provider (anthropic / openai / google / ollama) and model name that overrides the global default |

### General

- **Real-time updates**: All pages listen for SSE events from the API and refresh automatically.
- **Emergency Stop**: Red button stops the worker from picking up new tasks immediately.

## API Reference

### Authentication

All requests except `/auth/login` and `/worker/heartbeat` require:

```text
Authorization: Bearer <token>
```

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "password": "your-admin-password"
}
```

Response:

```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer"
}
```

### Projects

#### Projects: List

```http
GET /projects
Authorization: Bearer <token>
```

#### Projects: Create

```http
POST /projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "my-project",
  "repo_path": "/path/to/repo",
  "repo_url": "https://github.com/user/repo",
  "default_branch": "main"
}
```

#### Projects: Get

```http
GET /projects/{id}
Authorization: Bearer <token>
```

#### Projects: Update

```http
PUT /projects/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "paused"
}
```

#### Projects: Delete

```http
DELETE /projects/{id}
Authorization: Bearer <token>
```

### Tasks

#### Tasks: List

```http
GET /tasks?project_id={id}&status=queued
Authorization: Bearer <token>
```

#### Tasks: Create

```http
POST /tasks
Authorization: Bearer <token>
Content-Type: application/json

{
  "project_id": "uuid",
  "objective": "Task description",
  "mode": "interactive",
  "risk_level": "medium"
}
```

#### Tasks: Get

```http
GET /tasks/{id}
Authorization: Bearer <token>
```

#### Tasks: Update Status

```http
PUT /tasks/{id}/status?new_status=planning
Authorization: Bearer <token>
```

### Logs

#### Logs: Add Log

```http
POST /tasks/{id}/logs
Authorization: Bearer <token>
Content-Type: application/json

{
  "level": "info",
  "message": "Task started"
}
```

#### Logs: Get Logs

```http
GET /tasks/{id}/logs
Authorization: Bearer <token>
```

### Approvals

#### Approvals: List

```http
GET /approvals?status=pending
Authorization: Bearer <token>
```

#### Approvals: Approve

```http
POST /approvals/{id}/approve
Authorization: Bearer <token>
```

#### Approvals: Reject

```http
POST /approvals/{id}/reject
Authorization: Bearer <token>
```

### Worker

#### Worker: Heartbeat

```http
POST /worker/heartbeat
Content-Type: application/json

{
  "worker_id": "worker-1",
  "hostname": "my-laptop"
}
```

#### Worker: Get Status

```http
GET /worker/status
Authorization: Bearer <token>
```

#### Worker: Get Queued Tasks

```http
GET /worker/tasks/queued
```

### System

#### System: Emergency Stop

```http
POST /system/emergency-stop
Authorization: Bearer <token>
```

#### System: Clear Emergency Stop

```http
POST /system/emergency-stop/clear
Authorization: Bearer <token>
```

#### System: Get Status

```http
GET /system/emergency-stop/status
Authorization: Bearer <token>
```

## Database Schema

### Projects Table

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  repo_path TEXT NOT NULL,
  repo_url TEXT,
  default_branch TEXT DEFAULT 'main',
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Status Values:** `active`, `paused`, `archived`

### Tasks Table

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT DEFAULT 'queued',
  mode TEXT DEFAULT 'interactive',
  risk_level TEXT DEFAULT 'medium',
  branch_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

**Status Values:**

- `queued` - Waiting for worker
- `planning` - Worker is analyzing
- `waiting_for_plan_approval` - Awaiting user decision
- `plan_approved` - User approved
- `plan_rejected` - User rejected
- `executing` - Running (Phase 2+)
- `completed` - Done
- `failed` - Error

### Approvals Table

```sql
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  type TEXT DEFAULT 'plan',
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

**Status Values:** `pending`, `approved`, `rejected`

### Logs Table

```sql
CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  level TEXT DEFAULT 'info',
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

**Level Values:** `debug`, `info`, `warning`, `error`

### Workers Table

```sql
CREATE TABLE workers (
  worker_id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  status TEXT DEFAULT 'offline',
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Status Values:** `online`, `offline`, `stopped`

### SystemState Table

```sql
CREATE TABLE system_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Keys:**

- `emergency_stop` - `true` or `false`

## Troubleshooting

### API Won't Start

**Error:** `Port 8000 already in use`

Solution:

```bash
# Find and kill process using port 8000
lsof -i :8000
kill -9 <PID>

# Or use different port
export MNEME_API_PORT=8001
```

### Dashboard Can't Connect to API

**Symptom:** Errors when logging in or loading data

**Check:**

1. API is running: `curl http://localhost:8000/health`
2. From phone: Use laptop IP, not `localhost`
3. Both on same network
4. Firewall allows port 8000

**Fix:**

```bash
# Find laptop IP
ifconfig | grep "inet "

# Access from phone
http://192.168.1.100:8000  # Replace with your IP
```

### Worker Not Processing Tasks

**Check:**

1. Worker is running
2. Worker logs show: `[INFO] Heartbeat sent`
3. No emergency stop active

**Debug:**

```bash
# Restart worker with verbose output
python -u main.py

# Check worker is online
curl -H "Authorization: Bearer <token>" http://localhost:8000/worker/status
```

### Database Errors

**Error:** `sqlite3.DatabaseError: database is locked`

Solution:

```bash
# Restart everything
# Kill all processes
# Delete database
rm apps/api/mneme.db

# Restart API (auto-creates database)
cd apps/api && python main.py
```

### "Invalid Token" on Every Request

**Cause:** Token expired or secret key changed

**Fix:**

1. Log out (clear localStorage)
2. Log in again
3. Get new token

### Task Stuck in Planning

**Check:**

1. Worker hasn't crashed
2. No errors in worker logs
3. Try creating a new task

**Debug:**

```bash
# View task and its logs
curl -H "Authorization: Bearer <token>" http://localhost:8000/tasks/<id>
curl -H "Authorization: Bearer <token>" http://localhost:8000/tasks/<id>/logs
```

### Phone Can't Access Dashboard

**Troubleshoot:**

1. Get laptop IP: `ifconfig | grep inet | grep -v 127`
2. Ping from phone: `ping <laptop-ip>`
3. Try: `http://<laptop-ip>:5173`
4. Check firewall allows inbound on 5173

## Next Steps

- Phase 2: Add actual code generation with Claude API
- Phase 2: Add diff review before applying changes
- Phase 2: Add git operations (branch, commit)
- Phase 3: Multi-worker support
- Phase 3: Task templates
- Phase 4: Performance monitoring
