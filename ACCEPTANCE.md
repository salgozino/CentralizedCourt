# Acceptance & Evidence

Each criterion must be observable. Record the evidence (test name, command output,
screenshot path or commit) when it passes.

| #   | Slice                     | Acceptance criterion                                                                              | Status | Evidence |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------- | ------ | -------- |
| 1   | Login + roles             | A seeded user logs in with the console-printed code and sees a screen matching their roles.       | 🟡     | API: `backend/test/*.spec.ts` + `contract-tests/tests/auth.contract.test.ts` + live curl run of all 9 seeded users through the Vite proxy (T1). UI: `HomePage.test.tsx`, `LoginPage.test.tsx`, `App.test.tsx`. Pending: manual browser check. Commits `746b34c`, `0d5b364`, `e76547f` |
| 1   | Login + roles             | Only an admin can assign creator/juror roles; enforced by the backend (non-admin gets 403).       | ✅     | `backend/test/admin.spec.ts` + `contract-tests/tests/admin.contract.test.ts` (403 for creator/juror/user, 401 anonymous incl. real CSRF); live curl run (T1). Commits `0c16b1e`, `b9a2c5f` |
| 2   | Create case               | A case creator opens a case with description, outcomes and deadline; it appears in the case list. | ✅     | `backend/test/cases.spec.ts`, `cases-read.spec.ts`; `contract-tests/tests/cases.contract.test.ts`; `frontend/src/cases-routing.test.tsx` (creation → detail → refreshed list), `CasesSection.test.tsx`. `make test`: 133 backend + 80 frontend + 66 contract tests pass. The configured voting window is shown; the deadline starts at draw in slice 3. Manual frontend/backend validation completed and approved by the user. Implementation commits: `f53bb74`, `862042b`, `caab43c`, `db237fb`. |
| 2   | Create case               | A user without the creator role cannot create cases (backend returns 403).                        | ✅     | `backend/test/cases.spec.ts` (plain user and juror receive 403; admin exception), `contract-tests/tests/cases.contract.test.ts` (creator permission, CSRF, validation); frontend disabled-button tests. `make test` and `make lint` pass. |
| 3   | Draw jurors               | With a fixed seed, drawing 3 jurors always returns the same 3 users with the juror role.          | ✅     | API only: `backend/test/draw.spec.ts` (`draws the same 3 jurors every time with a fixed seed` via the injectable `DRAW_RNG`; admins never counted), `contract-tests/tests/draw.contract.test.ts`. Live curl run of the auth-verification matrix on `POST /api/cases/:id/draw` (10 rows match). `make test`: 152 backend + 80 frontend + 69 contract tests pass; `make lint` passes. Commits `0f1ede8` (red), `a882342` (green). |
| 3   | Draw jurors               | Manual assignment only accepts users with the juror role.                                         | ✅     | API only: `backend/test/draw.spec.ts` (`manual assignment`: plain user, creator and admin-with-juror-flag get 422 `Only users with the juror role can be assigned`; case stays `awaiting_jurors`), `contract-tests/tests/draw.contract.test.ts`. No UI yet. Commits `0f1ede8` (red), `a882342` (green). |
| 3   | Draw jurors               | Each juror's deadline starts when they are drawn and is shown in the UI.                          | ⬜     |          |
| 4   | Vote + resolve            | If 2 of 3 jurors vote "A" before the deadline, the case becomes "Resolved: A".                    | ⬜     |          |
| 4   | Vote + resolve            | A vote after the deadline (via injected clock) is rejected.                                       | ⬜     |          |
| —   | End to end                | The full acceptance check runs as one automated test/script and passes.                           | ⬜     |          |

## Escaped defects

Bugs found after a criterion was marked as passed.

| Date | Criterion # | Description | Found by | Fix commit |
| ---- | ----------- | ----------- | -------- | ---------- |
