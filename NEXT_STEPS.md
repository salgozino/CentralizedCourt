# Next Steps

## Current state

- Slice 1 implemented on `feat/slice1/gpt`: custom email user, nine-account
  idempotent seed, console code login, Django sessions, logout and admin role API.
- React UI includes login, role-specific home sections and admin role editing.
  CSRF is enforced; profile refresh/refocus shows role changes from other sessions.
- `make test`: 38 backend + 17 frontend tests pass. `make build`, `make lint` and
  `make e2e` pass. Browser E2E uses real console codes for all nine users and a
  temporary SQLite database. See `README.md` for run/test instructions.
- Custom user is in the initial accounts migration. The old empty scaffold
  database was backed up outside the repository; the new local DB is migrated
  and seeded. No .env changes.
- `RUN_LOG.md` and `usage/` record the session baseline and final usage delta.

## Next

1. Human review and additional contract tests for slice 1.
2. Slice 2: create a case and list cases; enforce creator permission in backend.
   Do not implement jury draw or voting yet.

## Open questions / limitations

- Tie-breaking rule when votes are split (needed before slice 4).
- Local-only login deliberately prints codes; no production rate limiting or
  private delivery service. Deployment hardening is outside the current scope.
- Build passes with a large UI-library chunk warning; optimize if needed later.
