#!/bin/bash
# Quick start script for Mneme Command Center
# Run: ./start.sh

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Mneme Command Center - Phase 1${NC}"
echo -e "${BLUE}================================${NC}\n"

# Check Python version
echo -e "${YELLOW}Checking Python version...${NC}"
python3 --version

# Check Node version
echo -e "${YELLOW}Checking Node version...${NC}"
node --version

# Setup Backend
echo -e "\n${BLUE}Setting up Backend...${NC}"
cd apps/api
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv venv
fi

source venv/bin/activate
echo -e "${YELLOW}Installing dependencies...${NC}"
pip install -q -r requirements.txt

echo -e "${GREEN}✓ Backend ready${NC}"
echo -e "  Start with: cd apps/api && source venv/bin/activate && python main.py"

# Setup Dashboard
echo -e "\n${BLUE}Setting up Dashboard...${NC}"
cd ../../apps/dashboard
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install -q
fi

echo -e "${GREEN}✓ Dashboard ready${NC}"
echo -e "  Start with: cd apps/dashboard && npm run dev"

# Setup Worker
echo -e "\n${BLUE}Setting up Worker...${NC}"
cd ../../worker
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv venv
fi

source venv/bin/activate
echo -e "${YELLOW}Installing dependencies...${NC}"
pip install -q -r requirements.txt

echo -e "${GREEN}✓ Worker ready${NC}"
echo -e "  Start with: cd worker && source venv/bin/activate && python main.py"

echo -e "\n${GREEN}================================${NC}"
echo -e "${GREEN}✓ All components ready!${NC}"
echo -e "${GREEN}================================${NC}\n"

echo -e "${YELLOW}Quick Start:${NC}"
echo -e "1. Terminal 1 - Backend:"
echo -e "   cd apps/api && source venv/bin/activate && python main.py"
echo -e ""
echo -e "2. Terminal 2 - Dashboard:"
echo -e "   cd apps/dashboard && npm run dev"
echo -e ""
echo -e "3. Terminal 3 - Worker:"
echo -e "   cd worker && source venv/bin/activate && python main.py"
echo -e ""
echo -e "${YELLOW}Access:${NC}"
echo -e "- Dashboard: http://localhost:5173"
echo -e "- API: http://localhost:8000"
echo -e "- From phone: http://<laptop-ip>:5173"
echo -e ""
echo -e "${YELLOW}Default password: admin${NC}"
echo -e "${YELLOW}See docs/SETUP.md for full documentation${NC}"
