# Day 5 implementation verification

Implemented the agreed refusal lifecycle for new manual cases. The specification remains in
[day5-specs.md](day5-specs.md).

## Automated evidence

- Red behavior commit: `23636be`; initial `make test-backend` run: 7 failures, 227 passes.
- Contract/browser/configuration test commit: `a3fd292`.
- Backend: `backend/test/refusal.spec.ts` covers duration validation, exact refusal cutoffs, silent
  continuation, logical shared voting deadlines, late settlement, linked repeated replacements, occupied seats,
  prior-juror exclusion, multiple vacancies/pool exhaustion, access loss, retained creator powers, role restrictions
  and request guard precedence. Existing voting regression tests also exercise stored legacy manual cases.
- Migration: `backend/test/refusal-migration.spec.ts` upgrades populated pre-feature awaiting/voting/resolved
  manual cases and checks preservation of every original field, deadline and vote, with no refusal backfill.
- HTTP: `contract-tests/tests/refusal.contract.test.ts` verifies guard ordering, access loss and linked history
  against a real backend process. Existing manual-case contracts now send the required explicit duration.
- Browser: `e2e/tests/refusal.spec.ts` creates a manual case, checks the 24-hour default, assigns a panel,
  cancels then confirms refusal, checks access loss, fills the vacancy and reloads durable assignment history.
  Existing manual draw, random draw and voting browser flows remain covered.
- Frontend production build passed; the existing library chunk-size warning remains.

## Final checks

- `make test`: passed — 235 backend, 128 frontend, 76 contract and 4 Chromium browser tests.
- `make lint`: passed, zero warnings.
- Frontend production build: passed through a temporary root Make target running `yarn build` in `frontend/`.
- Temporary live verification server was stopped after the matrix passed.
- Backend rollback boundary: refusal migration/entities, case controller/services and updated backend/HTTP fixtures.
  The migration preserves legacy data; reverting the feature after use would discard refusal-specific history fields.
- UI rollback boundary: refusal configuration, detail/history/replacement UI, API adapters and corresponding tests.

## Local live permission verification

Used the repository [auth-verification skill](../../.agents/skills/auth-verification/SKILL.md), its login script,
`curl`, an isolated temporary database and a separate local backend at `http://localhost:18055`.
The expected matrix was written before executing its requests. Refusal policy: only the current seat's juror
can refuse; historical/unrelated jurors lose visibility; creator/admin access alone grants no juror seat.
Replacement policy: case owner or administrator, independent of current creator-role flag.
Invalid refusal body: `{bad: true}`; valid: `{}`. Invalid replacement body: `{}`;
valid: `{position: 0, jurorId: <eligible candidate>}`. CSRF precedes permission/body validation.

All 19 rows matched. Test records were created only in `/tmp/day5-live/db.sqlite3`.

| Request | As | Expected | Actual | Detail |
| --- | --- | --- | --- | --- |
| refuse anonymous | anonymous | 401 | 401 | Unauthorized |
| refuse CSRF user | user | 403 | 403 | CSRF check Failed |
| refuse CSRF creator | creator | 403 | 403 | CSRF check Failed |
| replace anonymous | anonymous | 401 | 401 | Unauthorized |
| replace CSRF user | user | 403 | 403 | CSRF check Failed |
| replace CSRF creator | creator | 403 | 403 | CSRF check Failed |
| refuse hidden plain user | user | 404 | 404 | Not Found |
| refuse creator without seat | creator | 403 | 403 | Only current jurors can refuse |
| refuse admin without seat | admin | 403 | 403 | Only current jurors can refuse |
| refuse unassigned juror | juror2 | 404 | 404 | Not Found |
| replace plain user | user | 403 | 403 | Only the case creator or an admin can draw jurors |
| replace assigned juror | juror | 403 | 403 | Only the case creator or an admin can draw jurors |
| refuse invalid body | juror | 422 | 422 | [{'type': 'unrecognized_keys', 'loc': ['body', 'payload'], 'msg': 'Unrecognized key: "bad"'}] |
| replace invalid body | creator | 422 | 422 | [{'type': 'missing', 'loc': ['body', 'payload', 'position'], 'msg': 'Field required'}, {'type': 'missing', 'loc': ['body', 'payload', 'jurorId'], 'msg': 'Field required'}] |
| refuse current juror | juror | 200 | 200 | refused: true |
| refused juror loses read access | juror | 404 | 404 | Not Found |
| creator fills vacancy | creator | 200 | 200 | Case detail with current panel and assignment history |
| refuse second current juror | juror2 | 200 | 200 | refused: true |
| admin fills vacancy | admin | 200 | 200 | Case detail with current panel and assignment history |
