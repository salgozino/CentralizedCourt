# Acceptance & Evidence

Each criterion must be observable. Record the evidence (test name, command output,
screenshot path or commit) when it passes.

| #   | Slice                     | Acceptance criterion                                                                              | Status | Evidence |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------- | ------ | -------- |
| 1   | Login + roles             | A seeded user logs in with the console-printed code and sees a screen matching their roles.       | ✅     | `backend/tests/test_auth.py::test_seeded_users_log_in_with_their_roles`, `frontend/src/App.test.tsx` ("sections per role"); manual curl run through the Vite proxy. Commit `6538c02` |
| 1   | Login + roles             | Only an admin can assign creator/juror roles; enforced by the backend (non-admin gets 403).       | ✅     | `backend/tests/test_admin_roles.py::test_non_admin_gets_403`, `::test_admin_grants_creator_and_juror`. Commit `eef911c` |
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
| 2026-10-02 | 1 (admin-only roles) | `PUT /api/admin/users/{id}/roles` validated the body before checking admin, so a non-admin got `422` with role-specific messages instead of `403` and could enumerate roles. | Human review | `dfbd1e6` |
| 2026-10-02 | 1 (login with code) | The 5-attempt limit was per code, but `request-code` could be called without limit, giving unlimited guesses (brute force of the 6-digit code). Fixed with a per-user lockout across codes. | Human review | `fe02c38` |
