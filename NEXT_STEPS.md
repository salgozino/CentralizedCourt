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
  - `make test`: 70 backend + 19 frontend tests pass. Live API run verified all 9 users.
  - Native review: all work-unit commits approved except `746b34c` (escalated for the
    login brute-force; superseded by the per-user throttle in `e76547f`, approved).
- Agent instructions in `AGENTS.md` (how to set up, run and test the app).

## Next

1. Manual browser check of slice 1 UI (login for each role, admin toggles roles).
2. Maintainer: inspect escalated review lineage `review-64a8d92662496083` (worktree
   `../attempt-a-odd-review-746b34c`, holds the rejected fix `54ed727`), then remove it.
3. Review/merge `feat/slice1/gentle`.
4. Slice 2: create a case and see it listed (creator role only).

## Open questions / decisions pending

- Tie-breaking rule when votes are split (needed before slice 4).
- Login codes are throttled per user: at most 10 failed verifications and 5 issued codes
  per 15 minutes (older unused codes are revoked on each new request). There is no
  per-IP limit.
- Malformed JSON is remapped from ninja's 400 to 422 by matching ninja's error message
  (`config/urls.py`); re-check after ninja upgrades.

## Advisory review follow-ups (non-blocking)

- Auth throttle: targeted lockout/DoS (anyone can burn a user's 15-min budget), check-then-act
  races on lockout and issuance cap, `used_at` reused for revocation, a vacuous/misnamed test
  in `test_auth.py` (`test_failures_survive_new_code_requests`), constants without rationale.
- Frontend: admin role toggles can lose updates on fast clicks, `App` masks backend errors
  on `getMe`, logout failure is silent; login/admin error paths lack tests.
- Accounts: seed is not atomic; email case handling differs between manager and
  `get_or_create`.
