# Mneme Installation and Run Manual

This manual is the fastest way to install, configure, verify, and run Mneme on a Linux/macOS dev machine.

## 1. Clone and enter project

```bash
git clone <your-repo-url>
cd mneme-command-center
```

## 2. Create editable env files

```bash
./env/init.sh
```

Now edit:

- `.env`
- `apps/dashboard/.env.local`

Minimum values to set in `.env`:

```env
MNEME_SECRET_KEY=replace-with-a-long-random-string
MNEME_ADMIN_PASSWORD=choose-a-password
MODEL_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3.1
```

Optional runtime controls:

```env
AGENT_SANDBOX_MODE=docker
AGENT_BUDGET_USD=10
```

- Use `AGENT_SANDBOX_MODE=docker` for hardened execution.
- Use `AGENT_SANDBOX_MODE=process` only on a temporary unconstrained feature branch.

## 2.5 Create an unconstrained feature branch (optional)

There is no built-in permanent unconstrained branch. Create one only when you need a developer-only relaxed runtime:

```bash
cd /workspaces/mneme-command-center
git checkout main
git pull origin main
git checkout -b feature/unconstrained-$(date +%Y%m%d)-<topic>
```

In `.env` for this branch only:

```env
AGENT_SANDBOX_MODE=process
AGENT_BUDGET_USD=0
```

When done, switch back to hardened defaults:

```bash
git checkout main
# restore env values
```

Detailed operator guide: [docs/UNCONSTRAINED_BRANCH_OPERATIONS.md](docs/UNCONSTRAINED_BRANCH_OPERATIONS.md)

## 3. Install backend

```bash
cd apps/api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 4. Install dashboard

```bash
cd ../dashboard
npm install
```

## 5. Install worker dependencies

```bash
cd ../../worker
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 6. Optional: install and start Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1
ollama serve
```

In another terminal, verify:

```bash
curl http://localhost:11434/api/tags
```

## 7. Run services

Open 3 terminals:

### Terminal A (API)

```bash
cd /path/to/mneme-command-center/apps/api
source venv/bin/activate
set -a && source ../../.env && set +a
python main.py
```

### Terminal B (Dashboard)

```bash
cd /path/to/mneme-command-center/apps/dashboard
npm run dev -- --host 0.0.0.0
```

### Terminal C (Worker)

```bash
cd /path/to/mneme-command-center
source worker/venv/bin/activate
set -a && source .env && set +a
python -m worker.main
```

## 8. Verify installation

```bash
# API
curl http://localhost:8000/health

# Dashboard (HTML should be returned)
curl -I http://localhost:5173

# Optional: run tests
cd /path/to/mneme-command-center
PYTHONPATH=. /home/codespace/.python/current/bin/python -m pytest -v
```

## 9. Access dashboard

- Local: `http://localhost:5173`
- Network: use the URL printed by Vite, usually `http://<your-ip>:5173`

Login password: `MNEME_ADMIN_PASSWORD` from `.env`.

Operational notes from the latest reliability pass:

- Persisted auth token is validated on app boot; invalid tokens are cleared automatically.
- SSE stream is closed on logout to avoid stale session updates.
- Worker controls are available at `/workers` (launch/stop + runtime status).
- Approval actions support approve/reject/modify across both modern and legacy views.
- Mutation failures surface as dismissible in-app error toasts.

If you are using the Docker stack, bring up the full system with:

```bash
docker compose up -d api worker ollama
```

## 10. Troubleshooting quick fixes

- Port busy:
  - `lsof -i :8000` then stop conflicting process
  - `lsof -i :5173` then stop conflicting process
- Missing Python package:
  - Activate the correct venv and rerun `pip install -r requirements.txt`
- Dashboard cannot reach API:
  - Confirm `apps/dashboard/.env.local` has `VITE_API_URL=http://localhost:8000`
- Worker idle:
  - Confirm API is healthy and no emergency stop is active

## 11. CI verification after push

```bash
cd /workspaces/mneme-command-center.
gh run list --workflow CI --limit 5
gh run watch --exit-status
```

If a run fails, inspect logs directly:

```bash
gh run view --log-failed
```
