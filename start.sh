#!/bin/bash
# Mneme Command Center bootstrap
# Usage: ./start.sh

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}Mneme Command Center - Guided Startup${NC}"
echo -e "${BLUE}=========================================${NC}\n"

command -v python3 >/dev/null || { echo -e "${RED}python3 is required${NC}"; exit 1; }
command -v node >/dev/null || { echo -e "${RED}node is required${NC}"; exit 1; }

echo -e "${YELLOW}Python:${NC} $(python3 --version)"
echo -e "${YELLOW}Node:${NC} $(node --version)"

if [ ! -f "$ENV_FILE" ]; then
    echo -e "\n${YELLOW}.env not found. Creating from .env.example...${NC}"
    cp "$ENV_EXAMPLE" "$ENV_FILE"
fi

ensure_env_value() {
    local key="$1"
    local prompt="$2"
    local default_value="${3:-}"

    local current
    current=$(grep -E "^${key}=" "$ENV_FILE" | head -n 1 | cut -d'=' -f2- || true)
    if [ -n "$current" ]; then
        return
    fi

    local value
    if [ -n "$default_value" ]; then
        read -r -p "$prompt [$default_value]: " value
        value="${value:-$default_value}"
    else
        read -r -p "$prompt: " value
    fi

    if grep -qE "^${key}=" "$ENV_FILE"; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
        echo "${key}=${value}" >> "$ENV_FILE"
    fi
}

echo -e "\n${BLUE}Environment checks${NC}"
ensure_env_value "MNEME_SECRET_KEY" "Set MNEME_SECRET_KEY"
ensure_env_value "MNEME_ADMIN_PASSWORD" "Set admin password" "admin"
ensure_env_value "MODEL_PROVIDER" "Choose model provider (anthropic/openai/google/ollama)" "ollama"

MODEL_PROVIDER=$(grep -E '^MODEL_PROVIDER=' "$ENV_FILE" | cut -d'=' -f2-)
case "$MODEL_PROVIDER" in
    anthropic) ensure_env_value "ANTHROPIC_API_KEY" "Enter ANTHROPIC_API_KEY" ;;
    openai) ensure_env_value "OPENAI_API_KEY" "Enter OPENAI_API_KEY" ;;
    google) ensure_env_value "GOOGLE_API_KEY" "Enter GOOGLE_API_KEY" ;;
    ollama) ensure_env_value "OLLAMA_BASE_URL" "Set OLLAMA_BASE_URL" "http://localhost:11434" ;;
    *) echo -e "${YELLOW}Unknown MODEL_PROVIDER '$MODEL_PROVIDER' (you can fix this later in Settings).${NC}" ;;
esac

echo -e "\n${BLUE}Setting up API (python venv + deps)${NC}"
cd "$ROOT_DIR/apps/api"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

echo -e "\n${BLUE}Setting up Worker deps${NC}"
pip install -q -r "$ROOT_DIR/worker/requirements.txt"

echo -e "\n${BLUE}Setting up Dashboard (npm deps)${NC}"
cd "$ROOT_DIR/apps/dashboard"
npm install -q

echo -e "\n${BLUE}Starting services...${NC}"
cd "$ROOT_DIR"

# Load env for child processes
set -a
source "$ENV_FILE"
set +a

if lsof -i :8000 >/dev/null 2>&1; then
    echo -e "${YELLOW}Port 8000 already in use; skipping API launch.${NC}"
else
    (cd "$ROOT_DIR/apps/api" && source venv/bin/activate && python main.py) &
    echo -e "${GREEN}API started on http://localhost:8000${NC}"
fi

if lsof -i :5173 >/dev/null 2>&1; then
    echo -e "${YELLOW}Port 5173 already in use; skipping dashboard launch.${NC}"
else
    (cd "$ROOT_DIR/apps/dashboard" && npm run dev -- --host) &
    echo -e "${GREEN}Dashboard started on http://localhost:5173${NC}"
fi

read -r -p "Start worker now? (y/N): " START_WORKER
if [[ "$START_WORKER" =~ ^[Yy]$ ]]; then
    (cd "$ROOT_DIR" && source "$ROOT_DIR/apps/api/venv/bin/activate" && python -m worker.main) &
    echo -e "${GREEN}Worker started${NC}"
fi

echo -e "\n${GREEN}Mneme is running.${NC}"
echo -e "- Dashboard: http://localhost:5173"
echo -e "- API:       http://localhost:8000"
echo -e "\nUse the dashboard Settings page to change model provider, keys, and GitHub token."
