# Next Steps

## Current state

- Slice 1 implemented on `feat/slice1/gpt`: custom email user, nine-account
  idempotent seed, console code login, Django sessions, logout and admin role API.
- React UI includes login, role-specific home sections and admin role editing.
  CSRF is enforced; profile refresh/refocus shows role changes from other sessions.
- Login challenges are browser-bound and independently limited to five attempts.
  Account-wide lockout was removed; attackers cannot exhaust another browser's
  budget or invalidate its code. SQLite enforces atomic verification and issuance
  budgets (20 per peer IP / 200 globally per ten minutes). `accounts.0003` applied
  locally; run `make migrate` elsewhere and re-request any pre-migration codes.
- `make test`: 53 backend + 17 frontend tests pass. `make build`, `make lint` and
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
- Local-only login deliberately prints codes. IP/global issuance limits can delay
  new code issuance on a shared NAT/proxy or during a flood; existing challenges
  remain verifiable. Vite is the socket peer locally. Production needs a trusted
  proxy policy, adaptive abuse controls and private delivery (see README).
- Build passes with a large UI-library chunk warning; optimize if needed later.
