# Acceptance & Evidence

Each criterion must be observable. Record the evidence (test name, command output,
screenshot path or commit) when it passes.

| #   | Slice                     | Acceptance criterion                                                                              | Status | Evidence |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------- | ------ | -------- |
| 1   | Login + roles + whitelist | A seeded user logs in with the console-printed code and sees a screen matching their role.        | ⬜     |          |
| 1   | Login + roles + whitelist | A non-whitelisted user cannot create cases and is never drawn as a juror.                         | ⬜     |          |
| 2   | Create case               | A case creator opens a case with description, outcomes and deadline; it appears in the case list. | ⬜     |          |
| 3   | Draw jurors               | With a fixed seed, drawing 3 jurors always returns the same 3 whitelisted jurors.                 | ⬜     |          |
| 3   | Draw jurors               | Manual assignment only accepts whitelisted jurors.                                                | ⬜     |          |
| 3   | Draw jurors               | Each juror's deadline starts when they are drawn and is shown in the UI.                          | ⬜     |          |
| 4   | Vote + resolve            | If 2 of 3 jurors vote "A" before the deadline, the case becomes "Resolved: A".                    | ⬜     |          |
| 4   | Vote + resolve            | A vote after the deadline (via injected clock) is rejected.                                       | ⬜     |          |
| —   | End to end                | The full acceptance check runs as one automated test/script and passes.                           | ⬜     |          |

## Escaped defects

Bugs found after a criterion was marked as passed.

| Date | Criterion # | Description | Found by | Fix commit |
| ---- | ----------- | ----------- | -------- | ---------- |
