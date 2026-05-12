# Unconstrained Branch Operations Guide

## Purpose

This guide defines what an unconstrained branch is in Mneme, when to use it, and how to operate it safely.

## What the unconstrained branch is

There is no permanent branch named unconstrained in this repository.

In Mneme, unconstrained branch means:
- A temporary feature branch created by an operator from `main`
- Runtime configured with lower isolation (`AGENT_SANDBOX_MODE=process`)
- Typically used for local developer experiments, fast debugging, or reproducing difficult issues

Because it lowers runtime isolation, this mode should be treated as short-lived and high-trust only.

## Current repository state

At the time of writing:
- Active default branch: `main`
- Existing long-lived branches are phase or feature branches (for example `feature/phase10-safety-remediation`, `feature/phase11-ci-e2e-automation`, `feature/dashboard-redesign`)
- No branch named `unconstrained` exists

## Hardened vs unconstrained runtime

Hardened mode:
- `AGENT_SANDBOX_MODE=docker`
- Better isolation for command execution
- Recommended for day-to-day operation and anything production-like

Unconstrained mode:
- `AGENT_SANDBOX_MODE=process`
- No docker sandbox boundary around tool process execution
- Use only on disposable feature branches

## Create and operate an unconstrained branch

## 1. Create the branch

```bash
cd /workspaces/mneme-command-center.
git checkout main
git pull origin main
git checkout -b feature/unconstrained-$(date +%Y%m%d)-<topic>
```

## 2. Configure unconstrained runtime in `.env`

```env
AGENT_SANDBOX_MODE=process
AGENT_BUDGET_USD=0
```

Optional for extra guardrails even in unconstrained mode:

```env
AGENT_MEMORY_LIMIT_MB=512
```

## 3. Start services

```bash
docker compose up -d api worker dashboard ollama
```

Or native process workflow if preferred.

## 4. Validate runtime mode

Check effective values:

```bash
grep -n "AGENT_SANDBOX_MODE\|AGENT_BUDGET_USD\|AGENT_MEMORY_LIMIT_MB" .env
```

Then run baseline checks:

```bash
PYTHONPATH=. pytest -q
cd apps/dashboard && npm run build
```

## 5. Work policy for unconstrained branch

- Do not merge unconstrained-only env defaults to `main`
- Keep branch short-lived
- Commit frequently with clear messages
- Re-run tests before every push
- Avoid running unknown shell commands from untrusted prompts

## 6. Return to hardened mode

Before merging back:

```bash
git checkout main
```

Restore `.env` hardened defaults:

```env
AGENT_SANDBOX_MODE=docker
AGENT_BUDGET_USD=10
```

Re-validate:

```bash
PYTHONPATH=. pytest -q
cd apps/dashboard && npm run build
```

## 7. Recommended merge strategy

If unconstrained branch produced useful code changes:
- Open PR from `feature/unconstrained-...` to `main`
- Ensure CI checks pass (`backend-tests`, `frontend-build`, `live-api-integration`, `ui-smoke`)
- Verify `.env` examples and docs do not force unconstrained defaults

## Risk notes

Unconstrained mode is intentionally less isolated and should never be treated as equivalent to hardened operation. Use it only when needed and only in trusted local workflows.
