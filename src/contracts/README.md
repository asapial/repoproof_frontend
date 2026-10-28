# RepoProof v1 contract snapshot

`vendor/v1` contains exact backend source from commit `97a2c52ba6827ccd0f25a06f1933d3865f9bc44c`. Frontend imports `repoproof.ts` and `v1.ts`, which re-export that snapshot. Zod is pinned to the backend's resolved v3 version. `npm run contracts:check` compares exact bytes with the committed backend files, not the backend working tree. It requires a local backend Git checkout at `../repoproof_backend`, or `REPOPROOF_BACKEND` set to its path. Missing Git or commit is a failure, not a skipped check.

To synchronize a backend change, review its new commit and breaking changes, copy both backend contract files from that commit into `vendor/v1`, update the pinned SHA in `scripts/check-contracts.mjs` and this document, then run the compatibility check, tests, lint, typecheck and build. To compare against another full commit SHA before updating, set `REPOPROOF_CONTRACT_REF`. Backend and frontend use separate commits. Never silently change the snapshot to match a dirty backend working tree.

These are proposed contracts only. Run endpoints are not implemented. Validation tests use sample data, not live integration. Backend ownership, fixture authorization, idempotency and verdict policy remain server responsibilities. Repository and issue lists, cancellation, and history lack finalized DTOs. Frontend-to-live-backend integration remains pending.
