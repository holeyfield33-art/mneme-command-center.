# Phase 11 CI + E2E Automation Checklist

This checklist tracks phase 11 execution focused on CI reliability and automated end-to-end validation.

## Goals

- Ensure every PR runs backend tests, frontend build, and live API integration checks.
- Eliminate regressions where local runs pass but CI startup fails.
- Keep a minimal, deterministic live E2E path for auth/task/approval/worker status.

## Work Items

- [x] Add GitHub Actions workflow with baseline backend tests (`pytest -q`).
- [x] Add frontend build job (`npm ci && npm run build`).
- [x] Add live API integration job with health wait + `MNEME_RUN_LIVE_TESTS=1`.
- [ ] Add dashboard browser harness (Playwright/Cypress) for UI smoke tests.
- [ ] Add artifact upload for failing logs/screenshots.
- [ ] Add branch protection recommendations in docs.

## Validation Gates

- [x] Workflow file committed under `.github/workflows/ci.yml`.
- [x] Local baseline tests passing.
- [x] Local live integration tests passing.
- [ ] CI run green on GitHub after push.
