# Reviewer pass 2 (after full specs where shared)

Review against day5-specs.md: refusal and replacement for manual cases

New verdict: ACCEPT WITH FIXES. Measured against your spec, the feature does what it should and no permission bypass turned up. One major defect remains: the database schema created by the migration doesn't match the entity definitions. It doesn't affect how the app runs, but the next migration someone generates will pick it up. There are also two small cleanups.

The spec file is deleted in this working tree, so I read it from HEAD (sha256 e23622c3…50ad). I added a re-evaluation section to evidence/capstone/checks/validation.txt. I didn't modify any other file and didn't re-run the full suites: nothing changed since the first pass, where make lint and make test both exited 0.

Findings I withdraw (the spec asks for this behavior)

┌──────────────────────────────────────────┬───────────────────────────────────────────────────────────────────┐
│             Earlier finding              │                            Spec clause                            │
├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Major: random-draw cases can't refuse    │ Q1, Q6: refusal applies to manual cases only                      │
├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Major: replacement is picked by hand,    │ Q2, Q11: the creator or an admin picks manually                   │
│ not drawn                                │                                                                   │
├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Major: an empty seat waits forever       │ Q7: "Vacancies wait indefinitely… no automatic draw, cancellation │
│                                                                                 │
├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Minor: no refusal reason is stored       required                               │
├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Minor: other jurors can see who refused e full history                          │
└──────────────────────────────────────────┴───────────────────────────────────────────────────────────────────┘

Spec compliance

- Applicability and configuration: PASS.
  - Only new manual cases get the refusal he old flow, checked byrefusal-migration.spec.ts.
  - The refusal duration must be 60 s to 3ses reject it with 422 (probe P1).
  - The form defaults to 24 h.
  - The duration can't be changed after crdpoint for cases.
- Refusal cutoff: PASS.
  - A refusal exactly at the deadline is rc.ts:62-63).
  - In probe P4, a refusal after a 60-second window was rejected with 409.
  - Refusing during voting is rejected.
  - A second refusal returns 404, so a refusal is final.
- Shared voting start: PASS. Voting startss refusal deadline, and the whole panel gets the full voting window from there (refusal.spec.ts:58-71). In P4 the voting deadline was exactly the refusal
  deadline + 120 s. The case resolved usin
- Replacement: PASS.
  - Seats are filled one at a time; an occ
  - Anyone previously drawn for the case is rejected (422), and the existing eligibility rules still apply.
  - A replacement gets a fresh refusal winhains are covered by refusal.spec.ts:73.
  - Several vacancies and an exhausted pool are covered by refusal.spec.ts:112-120.
- Permissions: PASS (probes P2/P3, refusal
  - A refused juror loses access to the case and its vote.
  - The creator and admins keep their own
  - A current seat blocks removing the juror role; a refused seat doesn't.
- History: PASS.
  - Each assignment stores case, seat, juror, who selected them, draw time, refusal deadline and refusal time.
  - A replacement links back to the seat i
  - Rows are never deleted.
  - The creator, admins and current jurors jurors get 404.
- Strict TDD (red-test commit first): NOT VERIFIED. Checking it means reading the git log, which was out of bounds
  for this review.

Defects

Blocker: none.

Major
1. The database schema created by the migration doesn't match the entity definitions (AddRefusal.ts:6,8 against
   case-juror.entity.ts:44,51).
   - The migration adds the two new foreign keys (selectedById, predecessorId) inline, without names.
   - TypeORM expects named constraints, so
   - To reproduce: run make migrate on a fresh DB, then run cd backend && yarn typeorm-ts-node-commonjs        migration:generate -d src/data-sourcefull rebuild of the case_jurors table.
   - Effect: the next developer who runs yarn migration:generate, as AGENTS.md tells them to, gets that unrelatrebuild bundled into their migration.
   - Fix: create the new columns' foreign keys with the constraint names TypeORM generates (the dry-run output shows them), or accept the generated tion.

Minor
2. DrawOut.assignmentHistory (dto.ts:125) is declared but never set; the history is already inside case.
3. DrawJurorsPanel.tsx:89 chains ! asserti page crashes if that data is ever missingwhile the case is in the refusal period. Today it is always present, so this is fragility, not a live bug.

Security check of the backend endpoints: no change

Same probe results as before, no bypass. Both endpoints enforce login (401), the CSRF token (403), ownership or a current seat (403/404) and a strict requess replacements of the same seat give 200 and 409, and the history stays consistent.

In the diff but not in the spec

- /draw response: it now returns the full case detail including history, which changes the response of an existing
  endpoint. Nothing breaks: the frontend adated with it.
- UI extras: a "Refresh case" button and a "refused" notice on the case list. These are small UI conveniences.
- Docs: RUN_LOG.md and NEXT_STEPS.md were s.