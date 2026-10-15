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

## Draw UI (branch `feat/draw-ui`, merged to master)

- Random draw panel on case detail: adapter `drawJurors` (`2c41fc5`) and `DrawJurorsPanel` (`9e6375c`), merged in
  `d507f01` and `7569a12` from a shared contract commit `48d15be`.
- "Draw jurors" is shown only to the case creator or an admin (`798e63a` red, `28d0bda` green); the server 403
  remains the real guard.
- Juror reads backend merged in `01bbe09` (sections below).
- Draw UI aligned with the backend juror DTO `{jurorId, name, drawnAt, deadline}` (`d8a5b12` red, green right
  after): fixtures use the backend shape, and the panel test asserts names, no emails and no React key warnings.
  Covered end to end by the Playwright suite in `e2e/` (`tests/draw.spec.ts`, part of `make test`); reverting the
  fix makes it fail with the juror name missing.
- Case detail shows the persisted panel (`CaseDetail = Case & { jurors }` from `GET /api/cases/:id`), so jurors and
  deadlines survive a reload (`900c2f7` red, `8c9e88d` green); slice 3 row 3 is ✅.
- Day 4 parallel-workstream log: `odd/tasks/multitask-workstreams.md` (local, git-ignored).

## User names prerequisite

- `User.name` is now required (varchar 200, NOT NULL, no default), and juror DTO names are strings. DB rejects omitted/null names and null updates. Required-name red commit: `f6c6aa6`.
- The original `AddUserName` migration was revised for a fresh development DB, as explicitly approved. It requires an empty users table. An already-applied migration will not run again: reset the local DB (including SQLite sidecars, with the backend stopped), run `make migrate`, then `make seed` against the same DB path before restarting.
- Fresh seeds have basic names (Admin, Creator 1/2, Juror 1–5, User). Existing seeded users remain untouched, including names.
- No user-creation endpoint exists; name entry/management is deferred. Case creation is unchanged.
- Checks after making names required: `make test` passed (162 backend, 94 frontend, 70 contract). Original nullable-name prerequisite also passed; its first run hit two frontend 5-second timeouts and the unchanged rerun passed.

## Juror-read backend follow-up

- `GET /api/cases`: admin sees all, owner sees owned, assigned juror sees assigned cases; same ordering, no duplicates and no panel in list DTOs.
- `GET /api/cases/:id`: same visibility; full panel in position order, empty before draw. Hidden/missing/invalid cases remain 404; anonymous remains 401. Reads need no CSRF.
- Detail and draw's nested `case` include `jurors: [{jurorId, name, drawnAt, deadline}]`. Draw's top-level panel uses the same DTO: no email. `jurorId` is the user's ID, not the assignment row ID. Names are required strings, never null and never an email fallback; reset previously migrated development databases as described above.
- `POST /api/cases` stays unchanged. No frontend files changed. The frontend draw adapter/component still expects `userId` and `email`: update it to this new backend contract in the next frontend task (mocked frontend tests do not verify live compatibility).
- Evidence: red commit `7c532d1`; backend red run had 8 failures. The contract red run included expected draw failures, but cases contract compilation was blocked by an unsupported helper option; that test option was corrected during green implementation.
- Checks: `make test` passes (161 backend, 94 frontend, 70 contract); automated HTTP tests cover owner/admin/assigned vs unrelated creator/juror/user, anonymous, privacy and panel ordering. Live curl skill verification passed against `http://localhost:8001` using `/tmp/backend-w1.log` after the user applied the original name migration: owner/admin/assigned reads, hidden reads, no-CSRF reads, draw guard precedence, owner/admin draws, panel privacy/order and deadlines. Fixtures #1/#2 were created. That run preceded the NOT NULL change and showed null names in old fixtures; rerun after resetting/reseeding to verify live non-null names.

## Slice 4: vote + resolve (branch `feat/vote-resolve`, not merged)

- Rules (user decisions, 2026-10-15): a `voting` case resolves when every panel juror voted or the clock reached every
  juror's deadline. The winner needs strictly more than half of the cast votes; a split, a tie or no votes resolve
  with `result: null` (UI "No majority"). Votes are final. While voting only who voted is visible (each juror sees
  their own choice); every choice is public once resolved.
- API: `POST /api/cases/:id/vote` `{outcomeIndex}` (session + CSRF) answers 200 with the case detail. Order: 401, 403
  CSRF, 404 (missing/invalid or unreadable case), 403 `Only drawn jurors can vote` (owner/admin), 422 body or
  `outcomeIndex must refer to one of the case outcomes`, 409 `The voting deadline has passed` (clock ≥ own
  deadline), 409 `Votes are only accepted while the case is voting`, 409 `You have already voted`. Assignment, not
  the current juror flag, grants the vote.
- Juror DTO (detail and draw) gains `hasVoted` and `outcomeIndex`. Lists still omit the panel.
- No scheduler: expiry is settled lazily on case list, case detail and vote, with the injectable `CLOCK` provider
  (`backend/src/cases/clock.ts`), also used for `drawnAt`.
- Storage: nullable `outcomeIndex` and `votedAt` on `case_jurors`, migration `AddJurorVotes` (additive). An existing
  local DB only needs `make migrate`; no reset.
- UI: case detail shows Voted/Pending per juror, a "Your vote" panel for the signed-in panel juror (outcome radios,
  "Cast vote"), and "Resolved: <outcome>" or "Resolved: No majority"; the list shows the result.
- Evidence: `backend/test/vote.spec.ts`, `contract-tests/tests/acceptance.contract.test.ts`,
  `frontend/src/components/VotePanel.test.tsx`, `e2e/tests/vote.spec.ts`; live auth-verification on an isolated
  backend (15 rows match). `make test`: 191 backend, 114 frontend, 73 contract, 2 e2e; `make lint` passes.

## Next

1. Slice 4: manual browser check by the user, then merge `feat/vote-resolve` into master. Run `make migrate` on the
   local DB first.
2. All acceptance rows are ✅ except the slice 1 manual browser check (🟡).
3. Manual juror picker UI remains pending (not an acceptance criterion).
4. Manual selection "juror accepts" step is not implemented: manual assignment seats jurors directly.
5. The vote form reads the clock once per page load; a deadline crossed while the page is open is rejected by the
   backend (409), and the UI then reloads the case and shows it resolved with the reason (`364133f`).
6. Visual pass (2026-10-15, Playwright screenshots): low contrast in two Kleros library styles, the disabled
   "Cast vote" button and unchecked radio circles. Fixing it means overriding library styles; not done.
7. The frontend "Your voting deadline has passed." message is a fallback that is practically unreachable today: every
   juror of a panel gets the same deadline, so once it passes the case resolves and the vote form disappears.

## Open questions / decisions pending

- Product decision: the juror role must not be removable. The current admin roles endpoint still permits removal; enforcing this is explicitly out of scope for the juror-read work and must be addressed later.
- Juror reads: owner (WIPO), admin and assigned jurors can read cases. Lists omit panels; detail and draw's nested case expose the full panel (`jurorId`, `name`, `drawnAt`, `deadline`). Draw juror output must not expose email. Assigned access is based on assignment, not current role.

- Rule: an admin can do everything a creator can (and every admin action), without needing the
  extra role flags. Exception: an admin can never be drawn, assigned or vote as a juror, even
  with the juror flag set, because they already control the case (slice 3 must enforce it).
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
