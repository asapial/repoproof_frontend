# Portable local and prepared CI checks

RPF-CI-001FE prepares a manual-only local workflow. Nothing has been pushed,
activated or run on GitHub. Actions are pinned to immutable SHAs, the token has
only `contents: read`, checkout credentials are not retained, the PostgreSQL
service is disposable and the job is bounded to 15 minutes. Remote execution
and workflow publication still require approval.

Use Node 24.x and two independent, reviewed checkouts. Set
`REPOPROOF_BACKEND` to the backend checkout (RPF-CI-001BE or later), install
with `npm ci --ignore-scripts`, set the public test origin
`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:15440` and run `npm run check`.
The gate verifies **current backend contracts and historical pinned bytes**,
then tests, lint, typecheck, production build, full/production audits and lint
compatibility. A missing backend pin, missing Git history or real drift fails.

`npm run test:local` requires `RPF_E2E_DISPOSABLE_CONFIRMED=1`, a newly owned
PostgreSQL database at `127.0.0.1:35440/rpf012s_disposable` with `rpf_test`, and
the matching backend build/migrations. The harness supplies only synthetic
core values and selected OS environment names, refuses local .env files,
checks that ports 13300/15440 are free and stops its own processes in cleanup.
Set `RPF_E2E_CHROME` to an installed Chrome/Chromium executable (the Windows
test default is Chrome under Program Files; CI checks `/usr/bin/google-chrome`).
No browser installation, remote service, fixture execution or paid API is
performed automatically.

The real browser suite exercises actual PostgreSQL-backed login, drafts and
runner-unavailable behavior. Two separate, explicitly mocked transport suites
inject expired sessions and stalled headers/body streams. They verify account
isolation, timeout messages, released buttons and retries; they do not claim
real server faults or deployed HTTPS proof.

Future approved manual CI needs a **published full lowercase backend SHA**
as `backend_ref`, with its contract pin available in full history. Local-only
commits cannot be fetched by GitHub. Do not substitute an unrelated remote
branch or broaden permissions to hide missing commits. Backend and frontend
keep separate histories and separate tracking commits.

Local acceptance on Node 24.22.2: `npm run check` passed 28 tests, candidate and
pinned contract parity, lint, typecheck, production build, both zero-finding
audits and positive/negative lint-toolchain checks. `npm run test:local` passed
the actual PostgreSQL-backed browser suite and all three expiry/two timeout
fault-injection cases. Both application listeners were restricted to loopback
by the local harness and its child processes stopped on completion. YAML,
action pin, token permission and checkout hygiene validation passed. Evidence
is under parent `output/predeployment-2026-11-01/evidence/ci001fe-*`. This is
local validation, not a GitHub or deployed-domain result.
