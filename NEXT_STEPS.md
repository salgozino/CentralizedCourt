# Next Steps

Update at the end of each session. Keep it short: someone (or a fresh agent) should
be able to resume from here.

## Current state

- Slice 1 (login + roles) done on branch `feat/slice1/claude`.
  - Backend app `accounts`: custom `AUTH_USER_MODEL = accounts.User` (email login,
    role flags `is_admin`, `is_creator`, `is_juror`), `LoginCode` model, `seed`
    command (`make seed`), endpoints `/api/auth/*`, `/api/me`, `/api/admin/users*`.
  - Frontend: login screen (email → code), home with role sections, admin users
    table with creator/juror checkboxes, logout. Session cookie + CSRF header.
  - Tests: 63 backend (pytest), 11 frontend (vitest + Testing Library + jsdom).
- Local DB was recreated for the custom user model (old one kept as
  `backend/db.sqlite3.bak`, gitignored, can be deleted).

## Next

1. Review/merge slice 1. Check the UI visually in a browser (only covered by
   component tests and curl through the proxy so far).
2. Slice 2: create a case and see it listed (creator role only).

## Decisions taken in slice 1 (review)

- Requesting a new code invalidates the user's previous unused codes.
- A code is burned after 5 wrong attempts.
- Brute-force protection is per client IP, never per account (an attacker must not be
  able to lock another user out): 10 failed verifies or 20 code requests per IP in
  15 min throttle that IP (verify → `401` without touching any code; request-code →
  same `200`, no code, prints `LOGIN THROTTLED <ip>`). Uses `REMOTE_ADDR` only
  (`X-Forwarded-For` is spoofable). Residual risks: a distributed attacker (many IPs)
  is not bounded; users behind the same IP share the limit (locally everyone is
  `127.0.0.1`); anyone can still invalidate a user's pending code by requesting a new
  one or burn it with 5 wrong guesses (the user just requests another). Fixing the
  last one means binding codes to the requesting session, which changes the contract.
- Seed only creates missing users; it never resets roles of existing ones.
- Mutating endpoints that require a session enforce CSRF (`X-CSRFToken`);
  `GET /api/auth/csrf` sets the cookie.

## Open questions / decisions pending

- Tie-breaking rule when votes are split (needed before slice 4).
