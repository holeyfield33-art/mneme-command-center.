# Red Team Adversarial Review

Date: 2026-05-10
Repository: mneme-command-center
Branch reviewed: feature/phase2-items-1-4
Reviewer mode: Adversarial (external attacker + malicious authenticated user assumptions)

## Scope
This review focused on attack surfaces introduced or expanded by Phase 2:
- Authentication/session handling
- Worker control and worker-facing API routes
- Settings mutation and secret handling
- GitHub integration and token handling
- Eventing and browser exposure controls

## Executive Summary
The current implementation has multiple high-impact paths that can be used for unauthorized workflow manipulation, credential compromise, and persistent configuration tampering.

Top risks:
1. Unauthenticated worker endpoints allow direct task/workflow manipulation.
2. Default credentials/secrets are weak and token forgery is practical in default setups.
3. Settings persistence is vulnerable to `.env` injection via unsanitized values.
4. GitHub PAT can be exfiltrated through crafted repository URLs during clone.

## Findings

### 1) CRITICAL: Unauthenticated worker-control API surface
- Severity: Critical
- Impact: Full workflow takeover (change task status, create approvals, inject logs, alter branch names) without login token.
- Evidence:
  - [apps/api/app/routes/worker.py](apps/api/app/routes/worker.py#L61)
  - [apps/api/app/routes/worker.py](apps/api/app/routes/worker.py#L168)
  - [apps/api/app/routes/worker.py](apps/api/app/routes/worker.py#L203)
  - [apps/api/app/routes/worker.py](apps/api/app/routes/worker.py#L279)
  - [apps/api/app/routes/worker.py](apps/api/app/routes/worker.py#L308)
  - [apps/api/app/routes/worker.py](apps/api/app/routes/worker.py#L338)
  - [apps/api/app/routes/worker.py](apps/api/app/routes/worker.py#L366)
  - [apps/api/app/routes/worker.py](apps/api/app/routes/worker.py#L438)
- Attack scenario:
  1. Attacker reaches API network endpoint.
  2. Calls worker routes directly (no Authorization header required).
  3. Marks tasks as failed/completed, fabricates approvals, injects deceptive logs.
- Why this is exploitable:
  - These routes are mounted under public API with no route-level auth and no shared-worker secret check.
- Recommended fix:
  - Require authentication for all worker routes, or enforce an internal service credential (mTLS or static worker token header).
  - Restrict worker endpoints to loopback/private network and deny external ingress.
  - Add request signing for state-changing worker callbacks.

### 2) HIGH: Insecure default auth material enables easy compromise
- Severity: High
- Impact: Account takeover and token forgery in default deployments.
- Evidence:
  - [apps/api/app/config.py](apps/api/app/config.py#L8)
  - [apps/api/app/config.py](apps/api/app/config.py#L9)
  - [apps/api/app/routes/auth.py](apps/api/app/routes/auth.py#L44)
  - [apps/api/app/utils.py](apps/api/app/utils.py#L32)
- Attack scenario:
  1. Deployment starts with defaults (`admin` password, predictable secret key).
  2. Attacker logs in directly or forges JWT signed with default key.
  3. Full authenticated API control follows.
- Recommended fix:
  - Fail fast on startup if `MNEME_ADMIN_PASSWORD` or `MNEME_SECRET_KEY` are defaults/weak.
  - Enforce minimum secret entropy and password complexity.
  - Add login throttling/rate limiting and lockout/backoff.
  - Include issuer/audience checks and user claims in tokens.

### 3) HIGH: `.env` injection via unsanitized settings write path
- Severity: High
- Impact: Persistent config tampering, potential privilege persistence, service disruption.
- Evidence:
  - [apps/api/app/routes/system.py](apps/api/app/routes/system.py#L197)
  - [apps/api/app/routes/system.py](apps/api/app/routes/system.py#L223)
  - [apps/api/app/routes/system.py](apps/api/app/routes/system.py#L224)
- Attack scenario:
  1. Authenticated attacker submits settings value containing newline characters.
  2. Server writes raw `key=value` lines into `.env`.
  3. Injected extra lines create/overwrite unintended env variables.
- Why this is exploitable:
  - Values are written verbatim without newline/character sanitization or strict schema enforcement.
- Recommended fix:
  - Validate values against strict allowlists and reject control characters (`\n`, `\r`, null bytes).
  - Serialize `.env` with a hardened parser/writer library, not manual string concatenation.
  - Maintain explicit allowlist of writable keys and per-key validation patterns.

### 4) HIGH: GitHub PAT exfiltration risk in clone flow
- Severity: High
- Impact: Exposure of GitHub token to attacker-controlled host.
- Evidence:
  - [worker/github_client.py](worker/github_client.py#L22)
  - [worker/github_client.py](worker/github_client.py#L25)
  - [worker/github_client.py](worker/github_client.py#L45)
- Attack scenario:
  1. User provides crafted URL containing `github.com/...` in path on non-GitHub domain.
  2. Parser accepts URL due regex substring match.
  3. Clone code injects PAT into any `https://` URL (`https://TOKEN@...`) and performs `git clone`.
  4. Token is sent to attacker-controlled endpoint.
- Recommended fix:
  - Parse URL with `urllib.parse` and enforce host exactly `github.com` (or explicit trusted hosts list).
  - Do not inject token in URL; use git credential helpers or `http.extraHeader` scoped to trusted host.
  - Reject non-HTTPS and ambiguous userinfo/host formats.

### 5) MEDIUM: Unauthenticated event endpoints allow event injection and telemetry scraping
- Severity: Medium
- Impact: UI deception, event spam/DoS, information leak of internal task/approval metadata.
- Evidence:
  - [apps/api/app/main.py](apps/api/app/main.py#L83)
  - [apps/api/app/main.py](apps/api/app/main.py#L97)
- Attack scenario:
  - Any network client can subscribe to `/events` and post arbitrary `/events/broadcast`, pushing fabricated state updates to connected dashboards.
- Recommended fix:
  - Require auth on both stream and broadcast endpoints.
  - Apply per-client rate limiting and event schema validation.

### 6) MEDIUM: Overly permissive CORS posture
- Severity: Medium
- Impact: Increases risk from hostile web origins if token handling changes or browser/client behavior varies; weakens trust boundary.
- Evidence:
  - [apps/api/app/main.py](apps/api/app/main.py#L62)
  - [apps/api/app/main.py](apps/api/app/main.py#L63)
- Notes:
  - Current app uses bearer tokens from localStorage, which reduces classic cookie-CSRF risk, but wildcard origin policy remains overly broad for an admin control plane.
- Recommended fix:
  - Restrict allowed origins to explicit dashboard hosts.
  - Separate dev/prod CORS policies.

### 7) MEDIUM: No visible brute-force protection on login
- Severity: Medium
- Impact: Password guessing and credential stuffing risk, especially with weak/default password.
- Evidence:
  - [apps/api/app/routes/auth.py](apps/api/app/routes/auth.py#L44)
- Recommended fix:
  - Add IP+username rate limits, exponential backoff, and audit logging for failed attempts.

## Additional Observations
- Worker endpoints returning broad task/project metadata can aid recon if left unauthenticated.
- Runtime status endpoint is authenticated, which is good; continue minimizing secret-adjacent diagnostics.

## Prioritized Remediation Plan
1. Lock down worker endpoints (auth/service credential + network isolation).
2. Remove insecure defaults and enforce strong startup checks for secret/password.
3. Fix settings persistence with strict validation and safe env serialization.
4. Harden GitHub URL handling and PAT usage path (no URL token injection).
5. Authenticate and rate-limit event endpoints.
6. Tighten CORS allowlist.
7. Add auth brute-force protections.

## Suggested Verification Tests
- Negative auth tests: all worker mutating routes must return 401/403 without valid credential.
- URL validation tests: malicious repo URLs (`evil.com/...github.com/...`, userinfo tricks) must be rejected.
- Settings injection tests: newline/control-character payloads must be rejected.
- Security regression tests for default secret/password startup guard.

## Residual Risk if Unfixed
If findings 1-4 remain open, a network-adjacent attacker or low-privilege authenticated user can materially alter workflow outcomes, tamper operator visibility, and potentially compromise GitHub credentials.
