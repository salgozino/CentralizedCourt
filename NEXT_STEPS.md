# Next Steps

Update at the end of each session. Keep it short: someone (or a fresh agent) should
be able to resume from here.

## Current state

- Project brief, acceptance list and logs created.
- Stack: NestJS 11 + TypeORM + SQLite backend and Vite + React 18 + Tailwind v4 +
  kleros-ui frontend. The backend was migrated from Django + django-ninja (commits
  `38a27a1`..`9e90e19` on master) keeping the HTTP contract identical; `contract-tests/`
  was proven green against Django first and is the source of truth for that contract.
- Slice 1 (login + roles) is on master:
  - Entities: `User` (email login, `isAdmin`/`isCreator`/`isJuror`),
    `LoginCode` (hashed, single-use, 10 min TTL), idempotent seed (`make seed`).
  - API: `/api/auth/request-code`, `/api/auth/verify`, `/api/auth/logout`, `/api/me`,
    `/api/admin/users`, `/api/admin/users/{id}/roles` (session auth + CSRF).
  - UI: login (email -> code), home with per-role sections, admin role management.
  - `make test`: 88 backend (Jest) + 19 frontend (vitest) + 63 contract tests pass.
    Manual browser check against the Nest backend done by the user.
- Slice 2 (create/list/detail) is complete: automated checks pass and the user has validated
  the frontend and backend.
  - Entity `Case` (`cases` table, migration `CreateCases`): `creatorId`, `title`, `description`,
    `outcomes` (JSON `string[]`), `voteWindowSeconds`, `panelSize` (default 3), `selectionMethod`
    (default `random`), `status` (`awaiting_jurors` | `voting` | `resolved`, starts in
    `awaiting_jurors`), `result` (nullable), `createdAt`, `updatedAt`.
  - API: `POST /api/cases` (session + CSRF + creator role) answers 201 with the case. Guard order:
    401 anonymous, 403 CSRF, 403 `Only creators can create cases` (admins always pass), then
    422 validation. Unknown fields (e.g. `status`, `evidence`) are rejected with 422.
  - Validation: title 3-200 chars, description 1-5000 (both trimmed), 2-10 outcomes of 1-100 chars,
    unique ignoring case, `voteWindowSeconds` 60 s to 30 days, `panelSize` odd 1-11.
  - Tests: `backend/test/cases.spec.ts` and new cases in `backend/test/migrations.spec.ts`.
  - Reads: `GET /api/cases` returns complete `CaseOut[]`, newest first (`createdAt DESC`,
    `id DESC` tie-break), no pagination. Admins see all; other users see owned cases even after
    losing the creator role. Juror assignment visibility is deferred to slice 3. Anonymous reads
    answer 401. `GET /api/cases/:id` returns the same DTO; hidden, absent or invalid IDs answer
    404 `{"detail":"Not Found"}`. Reads do not require CSRF. No PATCH/DELETE.
  - UI: React Router routes `/` (Home), `/cases` (list), `/cases/new` (existing creation form),
    `/cases/:id` (full detail). Shared account header and Home/Cases navigation. Admin user/role
    management stays on Home. Lists have loading, empty, retryable error states; detail also has
    a 404 state. A 401 returns to login. New case is disabled and explained without creator/admin
    permission; direct access to the form is also guarded. Successful creation opens the detail
    with the returned DTO and confirmation; returning to the list refetches it.
  - The existing form retains its fields, defaults, client/server validation and error handling.
    Approved design: `mocks/slice2-cases.html` (standalone prototype, not application code).
  - Evidence: `backend/test/cases-read.spec.ts`, `contract-tests/tests/cases.contract.test.ts`,
    `frontend/src/cases-routing.test.tsx`, form tests and API tests. `make test`: 133 backend,
    80 frontend and 66 contract tests pass; `make lint` passes. Frontend production build passes.
    Manual frontend/backend validation completed and approved by the user.
- Slice 3 backend (draw), branch `feat/draw-vote`, commits `0f1ede8` (red), `a882342` (green):
  - Entity `CaseJuror` (`case_jurors`, migration `CreateCaseJurors`): `caseId`, `userId`, `position`,
    `drawnAt`, `deadline` (= `drawnAt` + `voteWindowSeconds`); unique (`caseId`, `userId`).
  - API: `POST /api/cases/:id/draw` (session + CSRF) answers 200 `{case, jurors: [{userId, email,
    drawnAt, deadline}]}` and moves the case to `voting`. Order: 401, 403 CSRF, 404 (missing/invalid
    id), 403 `Only the case creator or an admin can draw jurors` (owner by `creatorId`), 422 body,
    409 not `awaiting_jurors`, then 422 method checks / 409 `Not enough eligible jurors: N available,
    M required`. Random cases take no body (`jurorIds` → 422); manual cases need exactly `panelSize`
    distinct `jurorIds`, kept in the given order.
  - Eligible juror = `isJuror && isActive && !isAdmin`. RNG: `DRAW_RNG` provider, `crypto.randomInt`
    by default, seeded in tests; partial Fisher-Yates over the pool ordered by id.
  - Evidence: `backend/test/draw.spec.ts`, `contract-tests/tests/draw.contract.test.ts`, live
    auth-verification run. `make test`: 152 backend, 80 frontend, 69 contract tests; `make lint` passes.
- Zero-warning lint gate: husky `pre-commit` (lint-staged: Prettier, ESLint, oxlint) and
  `commit-msg` (commitlint, Conventional Commits); `make lint`.
- Agent instructions in `AGENTS.md` (how to set up, run, lint and test the app).

## Next

1. Vote casting (slice 4): needs a spec (endpoint shape, injected clock, tie rule) before the red
   tests. Write the end-to-end acceptance test skeleton (HTTP calls only) with it.
2. Slice 3 remaining: expose drawn jurors in case reads (list/detail visibility for assigned jurors)
   and the UI (draw button, manual picker, per-juror deadline), which closes slice 3 row 3.
3. Manual selection "juror accepts" step is not implemented: manual assignment seats jurors directly.

## Open questions / decisions pending

- Rule: an admin can do everything a creator can (and every admin action), without needing the
  extra role flags. Exception: an admin can never be drawn, assigned or vote as a juror, even
  with the juror flag set, because they already control the case (slice 3 must enforce it).
- Tie-breaking rule when votes are split (needed before slice 4). An odd panel only avoids ties
  with 2 outcomes and every juror voting.
- Votes reference the outcome label; decide before slice 4 whether matching is exact or
  case-insensitive (outcomes are unique ignoring case).
- Evidence (deferred, separate migration): PDF URLs added AFTER the case is created and BEFORE the
  draw, only by the creator or an admin; not part of `POST /api/cases`. Decide then whether a plain
  `string[]` is enough or each item needs `addedBy`/`addedAt` (audit log, concurrent appends).
- Draw by a non-owner of an existing case answers 403 (not 404), which reveals that the case
  exists; chosen to match the spec. Revisit if case ids must stay private.
- Panel larger than the juror pool (e.g. 7 requested, 5 jurors): to be solved later by giving
  jurors multiple votes once the pool grows. Today `panelSize` means number of jurors, one vote
  each. A case can stay in `awaiting_jurors` forever since there is no cancel.
- The frontend main bundle is now about 478 kB (154 kB gzip) after routing, up from
  449 kB (145 kB gzip) with the Kleros
  `DropdownSelect`, `Radio` and `TextArea` (react-aria). The >500 kB chunk warning on `yarn build`
  predates this (the library's `url-*` chunk).
- Login codes are bound to the browser session that requested them (only that session can
  verify them; a new request revokes only that session's older codes). Each code allows
  5 failed attempts, counted only for codes in the attacker's own session. Per-IP caps
  (client IP, 15-minute window, enforced atomically): 10 code requests (known or unknown
  email) and 20 failed verifications. Knowing an email is not enough to block or invalidate
  that user's login, and `request-code` answers identically for unknown emails.
  Per-IP limits use the client IP forwarded by the trusted Vite proxy (`X-Forwarded-For`,
  last entry); clients on the same machine still share one IP. `TRUSTED_PROXY_IPS`
  (`backend/src/http/client-ip.ts`) must list the real proxy in any other deployment.
  A distributed attacker with many IPs is not covered.
- Malformed JSON bodies are answered with 422 `{"detail": "Cannot parse request body"}` by
  the Nest body-parser error handling (`backend/src/app.ts`); the contract suite covers it.
- husky sets `core.hooksPath=.husky/_` in this clone's `.git/config`, which overrides any
  global `core.hooksPath` (e.g. personal `post-checkout` hooks).

## Advisory review follow-ups (non-blocking)

- For deployments beyond Vite, configure SPA fallback so `/cases/:id` serves `index.html`.

- Auth: `usedAt` reused for revocation, `LoginEvent` rows are never purged. Concurrent
  writes to the same session key are last-write-wins (different keys merge).
- Non-numeric `userId` on the admin roles route answers 422; not verified against the
  original Django behavior and not used by the frontend.
- Frontend: admin role toggles can lose updates on fast clicks, `App` masks backend errors
  on `getMe`, logout failure is silent; login/admin error paths lack tests.
- Accounts: seed is not atomic.
