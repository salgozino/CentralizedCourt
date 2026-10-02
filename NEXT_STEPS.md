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
  - Tests: 61 backend (pytest), 11 frontend (vitest + Testing Library + jsdom).
- Local DB was recreated for the custom user model (old one kept as
  `backend/db.sqlite3.bak`, gitignored, can be deleted).

## Next

1. Review/merge slice 1. Check the UI visually in a browser (only covered by
   component tests and curl through the proxy so far).
2. Slice 2: create a case and see it listed (creator role only).

## Decisions taken in slice 1 (review)

- Requesting a new code invalidates the user's previous unused codes.
- A code is burned after 5 wrong attempts.
- Per-user lockout: 10 wrong guesses across all codes created in the last 15 min
  lock the user out (verify refuses even the right code; request-code issues nothing,
  same generic response, prints `LOGIN LOCKED <email>`). Trade-off: an attacker can
  keep a known email locked out (DoS); acceptable for a local demo. No per-IP limit.
- `request-code` returns `422` for a malformed email (not just missing/wrong type).
- `PUT .../roles` accepts `"user"` in the list as a no-op; `"admin"` or unknown roles → `422`
  with one generic message, so errors do not reveal which roles exist.
- Admin endpoints check the admin role in the auth step (before body validation): a
  non-admin always gets the same `403`, whatever the body or user id.
- Seed only creates missing users; it never resets roles of existing ones.
- Mutating endpoints that require a session enforce CSRF (`X-CSRFToken`);
  `GET /api/auth/csrf` sets the cookie.

## Open questions / decisions pending

- Tie-breaking rule when votes are split (needed before slice 4).
