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
- Slice 2 (create a case) is in progress: creation works end to end, the case list does not exist yet.
  - Entity `Case` (`cases` table, migration `CreateCases`): `creatorId`, `title`, `description`,
    `outcomes` (JSON `string[]`), `voteWindowSeconds`, `panelSize` (default 3), `selectionMethod`
    (default `random`), `status` (`awaiting_jurors` | `voting` | `resolved`, starts in
    `awaiting_jurors`), `result` (nullable), `createdAt`, `updatedAt`.
  - API: `POST /api/cases` (session + CSRF + creator role) answers 201 with the case. Guard order:
    401 anonymous, 403 CSRF, 403 `Creator role required` (admins always pass), then
    422 validation. Unknown fields (e.g. `status`, `evidence`) are rejected with 422.
  - Validation: title 3-200 chars, description 1-5000 (both trimmed), 2-10 outcomes of 1-100 chars,
    unique ignoring case, `voteWindowSeconds` 60 s to 30 days, `panelSize` odd 1-11.
  - Tests: `backend/test/cases.spec.ts` and new cases in `backend/test/migrations.spec.ts`.
  - UI: a "Cases" section on the home, visible to every user, with a "Case list coming soon"
    placeholder. "New case" is enabled for creators and admins (disabled with an explanation
    otherwise) and hidden while the form is open. The form (`CreateCaseForm`) has title,
    description, 2-10 outcomes (add/remove, no reordering), voting window as days/hours/minutes
    (default 0/0/2), jurors select (1-11 odd, default 3) and selection radio (default random).
    Errors show after the first submit and follow edits; 422s map to fields by `loc`, 403 and
    network/500 errors show a message, 401 returns to the login. On success a card shows the case
    as returned by the backend. Pure logic in `frontend/src/cases/` (`draft.ts`, `duration.ts`).
  - Frontend tests: `CasesSection.test.tsx`, `src/cases/*.test.ts`, updates to `HomePage.test.tsx`
    and `api.test.ts`. Pending: manual browser check against the real backend.
- Zero-warning lint gate: husky `pre-commit` (lint-staged: Prettier, ESLint, oxlint) and
  `commit-msg` (commitlint, Conventional Commits); `make lint`.
- Agent instructions in `AGENTS.md` (how to set up, run, lint and test the app).

## Next

1. Slice 2, rest of the scope (decisions already taken):
   - `GET /api/cases`: one endpoint that filters by user. Creators see the cases they created
     (by `creatorId`, even after losing the creator role), admins see all, jurors see their
     assigned cases from slice 3, everyone else gets `[]`. Newest first, no pagination.
   - `GET /api/cases/:id`: same visibility rule; a case the user cannot see answers 404 (not 403).
   - No `PATCH`/`DELETE`: cases are immutable.
   - Contract tests for create/list/detail in `contract-tests/`.
   - UI: replace the "Case list coming soon" placeholder with the list, and add the case detail.
     The creation form is done.
   - Then mark the slice 2 rows of `ACCEPTANCE.md`.
2. Before slice 3, write the end-to-end acceptance test skeleton (only the HTTP calls) to fix the
   API shape of draw and vote.
3. Slice 3: the draw is an explicit step after creation (also needed for manual selection, after
   asking the juror whether they accept). Each juror's deadline = draw time + `voteWindowSeconds`.
   Validate `panelSize` against the eligible jurors at draw time, not at creation.

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
- Panel larger than the juror pool (e.g. 7 requested, 5 jurors): to be solved later by giving
  jurors multiple votes once the pool grows. Today `panelSize` means number of jurors, one vote
  each. A case can stay in `awaiting_jurors` forever since there is no cancel.
- The frontend main bundle grew from 231 kB to 449 kB (75 -> 145 kB gzip) with the Kleros
  `DropdownSelect`, `Radio` and `TextArea` (react-aria). The >500 kB chunk warning on `yarn build`
  predates this (the library's `url-*` chunk).
- `backend/test/app.spec.ts` hangs when `backend/.env` defines `SECRET_KEY`: the "missing
  SECRET_KEY" test spawns `src/main.ts`, which loads `.env`, starts the server and never exits.
  It passes in a checkout without `.env`. The test should isolate itself from `.env`.
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

- Auth: `usedAt` reused for revocation, `LoginEvent` rows are never purged. Concurrent
  writes to the same session key are last-write-wins (different keys merge).
- Non-numeric `userId` on the admin roles route answers 422; not verified against the
  original Django behavior and not used by the frontend.
- Frontend: admin role toggles can lose updates on fast clicks, `App` masks backend errors
  on `getMe`, logout failure is silent; login/admin error paths lack tests.
- Accounts: seed is not atomic.
