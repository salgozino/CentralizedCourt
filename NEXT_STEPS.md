# Next Steps

Update at the end of each session. Keep it short: someone (or a fresh agent) should
be able to resume from here.

## Current state

- Project brief, acceptance list and logs created.
- Scaffold done: Django + django-ninja backend (empty API) and Vite + React 18 +
  Tailwind v4 + kleros-ui frontend. Both start locally and `make test` runs one dummy
  test per side. No domain code yet.
- Agent instructions in `AGENTS.md` (how to set up, run and test the app).

## Next

1. Start slice 1: login + roles + whitelist. Define a custom `AUTH_USER_MODEL`
   before the first migration.

## Open questions / decisions pending

- Tie-breaking rule when votes are split (needed before slice 4).
