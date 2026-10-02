# Acceptance & Evidence

Each criterion must be observable. Record the evidence (test name, command output,
screenshot path or commit) when it passes.

| #   | Slice                     | Acceptance criterion                                                                              | Status | Evidence |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------- | ------ | -------- |
| 1   | Login + roles             | A seeded user logs in with the console-printed code and sees a screen matching their roles.       | ✅     | `make e2e`: all 9 seeded accounts; `test_each_seeded_user_logs_in_with_console_code`; `App.test.tsx` |
| 1   | Login + roles             | Only an admin can assign creator/juror roles; enforced by the backend (non-admin gets 403).       | ✅     | `test_non_admin_denied`, `test_admin_assigns_removes_and_preserves_admin`; `make e2e`: cross-session grant/remove |
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
| 2026-10-02 | 1 | `/api/auth/verify` allowed unlimited code guesses. Initial account-budget fix introduced account DoS (see next row); superseded by bounded browser challenges and source/global issuance limits. | User validation | `60b0a6f`, superseded by `85ba3c7` |
| 2026-10-02 | 1 | Knowing an email allowed exhausting the victim's account budget; reissuance also invalidated victim codes. Removed account lockout; isolated browser-bound challenges. Evidence: `test_attacker_cannot_block_admin_even_on_same_ip`, `test_admin_can_start_login_after_attack_from_another_source`, 15 security regressions, browser E2E with concurrent attacker requests while admin retains original code. | User review | `85ba3c7` |
