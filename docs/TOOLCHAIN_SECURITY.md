# Development toolchain security

RPF-SEC-005FE addresses the November 1, 2026 development-only minimatch
[glob-parts amplification advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249).
Production-only dependencies had zero findings; do not describe the affected
lint packages as independent production vulnerabilities.

ESLint 10.14.0 is the current supported major. typescript-eslint 8.72.1 supports
ESLint 10 and this project's TypeScript 5.9. Current upstream packages still
require vulnerable minimatch major versions, so overrides pin 11.0.3 only for
ESLint, @eslint/config-array and @typescript-eslint/typescript-estree. Their
named minimatch APIs are checked by `node scripts/check-lint-toolchain.mjs`,
including positive/negative TypeScript linting and generated-file exclusions.
Retain application lint and these compatibility checks when updating or
removing the overrides. Do not force npm audit's suggested downgrade.

References: [ESLint support](https://eslint.org/version-support/),
[migration](https://eslint.org/docs/latest/use/migrate-to-10.0.0),
[TypeScript ESLint compatibility](https://typescript-eslint.io/users/dependency-versions/).

Fresh acceptance: 16 tests, lint, typecheck, production build, clean
`npm ci --ignore-scripts`, contract snapshot parity and named-glob/lint checks
passed. Full and production-only npm audits report zero findings. No
non-development lockfile entry changed; original Linux libc metadata is
preserved. A production frontend browser regression against the actual
PostgreSQL-backed API passed on Node 24.22.2, including signup, login/logout,
draft persistence/deletion, CSRF-backed API behavior and truthful 503. No run
or evidence was created. The first browser harness attempt overlapped package
installation and could not load Next; the sequential rerun passed. Exact
records are in parent `output/predeployment-2026-11-01/evidence/sec005fe-*`.
Deployed HTTPS, real provider behavior and runner isolation remain unverified.
