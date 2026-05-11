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
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder
```

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
ollama pull qwen2.5-coder
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
/home/codespace/.python/current/bin/python -m pytest -v
```

## 9. Access dashboard

- Local: `http://localhost:5173`
- Network: use the URL printed by Vite, usually `http://<your-ip>:5173`

Login password: `MNEME_ADMIN_PASSWORD` from `.env`.

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
