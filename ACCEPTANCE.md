# Acceptance & Evidence

Each criterion must be observable. Record the evidence (test name, command output,
screenshot path or commit) when it passes.

| #   | Slice                     | Acceptance criterion                                                                              | Status | Evidence |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------- | ------ | -------- |
| 1   | Login + roles             | A seeded user logs in with the console-printed code and sees a screen matching their roles.       | 🟡     | API: `backend/tests/test_auth.py` + live curl run of all 9 seeded users through the Vite proxy (T1). UI: `HomePage.test.tsx`, `LoginPage.test.tsx`, `App.test.tsx`. Pending: manual browser check. Commits `746b34c`, `0d5b364`, `e76547f` |
| 1   | Login + roles             | Only an admin can assign creator/juror roles; enforced by the backend (non-admin gets 403).       | ✅     | `backend/tests/test_admin_api.py` (403 for creator/juror/user, 401 anonymous incl. real CSRF); live curl run (T1). Commits `0c16b1e`, `b9a2c5f` |
| 2   | Create case               | A case creator opens a case with description, outcomes and deadline; it appears in the case list. | ⬜     |          |
| 2   | Create case               | A user without the creator role cannot create cases (backend returns 403).                        | ⬜     |          |
| 3   | Draw jurors               | With a fixed seed, drawing 3 jurors always returns the same 3 users with the juror role.          | ⬜     |          |
| 3   | Draw jurors               | Manual assignment only accepts users with the juror role.                                         | ⬜     |          |
| 3   | Draw jurors               | Each juror's deadline starts when they are drawn and is shown in the UI.                          | ⬜     |          |
| 4   | Vote + resolve            | If 2 of 3 jurors vote "A" before the deadline, the case becomes "Resolved: A".                    | ⬜     |          |
| 4   | Vote + resolve            | A vote after the deadline (via injected clock) is rejected.                                       | ⬜     |          |
| —   | End to end                | The full acceptance check runs as one automated test/script and passes.                           | ⬜     |          |

## Escaped defects

Bugs found after a criterion was marked as passed.

| Date | Criterion # | Description | Found by | Fix commit |
| ---- | ----------- | ----------- | -------- | ---------- |
