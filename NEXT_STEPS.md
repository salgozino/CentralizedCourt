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
- Zero-warning lint gate: husky `pre-commit` (lint-staged: Prettier, ESLint, oxlint) and
  `commit-msg` (commitlint, Conventional Commits); `make lint`.
- Agent instructions in `AGENTS.md` (how to set up, run, lint and test the app).

## Next

1. Slice 2: create a case and see it listed (creator role only). Store the panel size
   (default 3) and the selection method (default random) on the case instead of
   hard-coding them, so later case procedures fit without rework (see `ROADMAP.md`, v1).
   The experiment scope and acceptance check stay unchanged.

## Open questions / decisions pending

- Tie-breaking rule when votes are split (needed before slice 4).
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
