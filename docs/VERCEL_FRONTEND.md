# Prepared repoproof-web Vercel project

RPF-VCL-001FE prepares an independent Next.js project on Vercel Hobby, Node
24.x. No Vercel resource, deployment, domain, account setting or remote
workflow was created or changed. `vercel.json` selects Next.js, a lifecycle-free
dependency install and the existing production build.

## Same-origin API routing

Set server-only `REPOPROOF_API_ORIGIN` to the exact approved HTTPS origin of
`repoproof-api`. Leave `NEXT_PUBLIC_API_BASE_URL` unset (or `/`). The browser
uses fixed relative `/api/auth/*` and `/api/v1/*` paths; Next's external rewrite
forwards them to that one configured backend. Inputs cannot choose another
host, and credentials, paths, query, fragments, wildcard origins and control
characters are rejected. Cloud routing rejects HTTP, including loopback.
Missing upstream or conflicting direct/proxy configuration fails on Vercel.
Local standalone checks may use HTTP loopback, matching the existing local
client rule; they do not establish public-domain TLS safety.

Backend `BETTER_AUTH_URL` and `FRONTEND_URL` must both be the exact public web
HTTPS origin in proxy mode. Backend's same-origin policy issues host-only,
Secure, HttpOnly, SameSite=Lax cookies without Domain. Rewrites forward cookies
and Set-Cookie; CSRF/origin checks remain backend-enforced. API responses retain
no-store, with private/no-store defaults in Next configuration. Global headers
disable content sniffing and framing and limit referrer disclosure. No secret
belongs in a NEXT_PUBLIC variable. A backend origin is public configuration,
not a credential or an authorization boundary.

Existing explicit direct-origin mode remains available locally when no proxy
is configured. Its separate-origin deployed-cookie behavior is not inferred
from same-origin tests. No run, job, artifact, model call or verdict is created
by this change; unavailable execution still returns RUNNER_UNAVAILABLE.

## Local evidence

Node 24.22.2 `npm run check`: 32 tests, lint, types, production build,
current-and-pinned backend contract parity, lint-toolchain checks and zero
full/production audit findings. Vercel config payload and manual CI definition
validation passed. The real production frontend proxied to the actual
PostgreSQL-backed API on loopback; signup, cookie/session forwarding,
save/restore/delete, login retry/logout, no-store, missing/evil-origin CSRF
denial and truthful 503 passed. Separate mocked expiry/account-switch and
stalled header/body recovery cases also passed. The first cache assertion
expected the optional private directive; the backend's no-store alone was
correctly retained and the accepted test checks that mandatory directive.

Build with `REPOPROOF_API_ORIGIN=http://127.0.0.1:15440`, no public direct
origin, and the reviewed backend path. Then use the CI-documented disposable
database and `RPF_E2E_SAME_ORIGIN=1 npm run test:local`. These tests use local
HTTP and synthetic credentials. Actual HTTPS certificates, Vercel rewrite
headers, browser privacy policies, provider quotas and project linkage remain
credential/deployment-dependent verification. Do not treat the loopback test
as deployed acceptance.

References checked November 1, 2026:
[Next rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites),
[Vercel rewrites](https://vercel.com/docs/routing/rewrites), backend
`docs/VERCEL_BACKEND.md` and each repository's CI instructions.
