# Next Steps

Update at the end of each session. Keep it short: someone (or a fresh agent) should
be able to resume from here.

## Current state

- Project brief, acceptance list and logs created.
- Scaffold done: Django + django-ninja backend and Vite + React 18 + Tailwind v4 +
  kleros-ui frontend.
- Slice 1 (login + roles) implemented on branch `feat/slice1/gentle`:
  - `accounts` app: custom `User` (email login, `is_admin`/`is_creator`/`is_juror`),
    `LoginCode` (hashed, single-use, 10 min TTL), idempotent `manage.py seed`.
  - API: `/api/auth/request-code`, `/api/auth/verify`, `/api/auth/logout`, `/api/me`,
    `/api/admin/users`, `/api/admin/users/{id}/roles` (session auth + CSRF).
  - UI: login (email -> code), home with per-role sections, admin role management.
  - `make test`: 65 backend + 19 frontend tests pass. Live API run verified all 9 users.
- Agent instructions in `AGENTS.md` (how to set up, run and test the app).

## Next

1. Manual browser check of slice 1 UI (login for each role, admin toggles roles).
2. Review/merge `feat/slice1/gentle`.
3. Slice 2: create a case and see it listed (creator role only).

## Open questions / decisions pending

- Tie-breaking rule when votes are split (needed before slice 4).
- No rate limit / attempt cap on login codes (6 digits, 10 min TTL). Fine locally; revisit
  before any non-local use.
- Malformed JSON is remapped from ninja's 400 to 422 by matching ninja's error message
  (`config/urls.py`); re-check after ninja upgrades.
