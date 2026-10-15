# Reviewer pass 1

- Session ID / started – ended: 1c2a60e1-53d6-44bf-bb30-762d57461a33 16:23 - 16:30
- Prompt: `reviewer-prompt.md` pass 1, committed in 008d347

Review: juror refusal and replacement (diff 4457a20...HEAD, evidence excluded)

Verdict: REJECT for the brief as written. Lint, all test suites and the security probes pass, but the feature only covers manual-selection cases, and the replacement is picked by hand rather than drawn from the pool. If you approved that narrower scope, the verdict becomes ACCEPT WITH FIXES (the two schema/entity mismatches below).

The diff sha256 matches d75fec56…0333. I didn't modify any repo file. The only file I created is the log, evidence/capstone/checks/validation.txt. The probe scripts live in the scratchpad, outside the repo. I didn't read the git log, commit messages or evidence/.

Commands (all logged with tail output and exit code)

┌─────────────────────────────────────────────┬────────────────────────────────────┬──────┐
│                   Command                   │               Result               │ Exit │
├─────────────────────────────────────────────┼────────────────────────────────────┼──────┤
│ make setup                                  │ done                               │ 0    │
├─────────────────────────────────────────────┼────────────────────────────────────┼──────┤
│ make lint                                   │ clean, zero warnings               │ 0    │
├─────────────────────────────────────────────┼────────────────────────────────────┼──────┤
│ make test                                   │ backend 235/235, frontend 128/128, │ 0    │
│                                             │  contract 76/76, e2e 4/4           │      │
├─────────────────────────────────────────────┼────────────────────────────────────┼──────┤
│ Security probe: my own contract test        │ 4/4 ran, results below             │ 0    │
│ against a live backend on a temp DB         │                                    │      │
├─────────────────────────────────────────────┼────────────────────────────────────┼──────┤
│ Migration up, then revert AddRefusal on a   │ down works; columns restored       │ 0    │
│ temp DB                                     │                                    │      │
├─────────────────────────────────────────────┼────────────────────────────────────┼──────┤
│ migration:generate --dryrun on a freshly    │ finds a schema/entity mismatch,    │ 0    │
│ migrated DB                                 │ below                              │      │
└─────────────────────────────────────────────┴────────────────────────────────────┴──────┘

Acceptance criterion: "a juror who refuses is replaced by another user with full traceability of the re-draw"

- Manual-selection cases: PASS.
  - Refusal is stored in refusedAt and never deleted.
  - The replacement links to the refused seat through predecessorId and records who picked it in selectedById, plus drawnAt and refusalDeadline.
  - The full chain is returned as assignmentHistory (cases.controller.ts:115). My probe P2 showed it correctly after a refusal and a replacement.
- Random-draw cases: FAIL.
  - These cases never enter a refusal period. A drawn juror calling /refuse gets 409 "The refusal window is closed" (probe P1).
  - Creating a random case with a refusal window is rejected with 422.
  - Causes: jury.service.ts:41 and the check added to dto.ts:14.
- "Draw another juror from the pool": NOT MET. POST /replace is a manual pick by the creator or an admin. Nothing is drawn.

Defects

Blocker: none.

Major
1. Random-draw cases can't refuse (jury.service.ts:41, dto.ts:14). Random is the default selection method and the one the main acceptance scenario uses. To reproduce: create a random case, draw, then POST /api/cases/:id/refuse as the drawn juror → 409.
2. No automatic re-draw, and an empty seat waits forever (jury.service.ts:83; NEXT_STEPS.md:22random case, draw, then POST /api/cases/:id/refuse as the drawn juror → 409.
2. No automatic re-draw, and an empty seat waits forever (jury.service.ts:83; NEXT_STEPS.md:22 says "Vacancies wait indefinitely"). If the creator never acts, the case stays in refusal permanently. There is also no limit on how often the voting start gets pushed back. To reproduce: a juror refuses and nobody calls /replace.
3. Database schema and entity definitions disagree (AddRefusal.ts:6,8 against case-juror.entity.ts:44,51).
   - The migration creates the two new foreign keys inline without names.
   - Generating a migration on a freshly migrated DB therefore produces a full rebuild of the case_jurors table, adding constraints for selectedById and predecessorId.
   - The next developer to run yarn migration:generate will get that unrelated rebuild mixed into their migration.

Minor
4. No refusal reason is stored. The brief mentions conflict of interest, but RefuseIn is an empty object (dto.ts:136) and {reason: …} is rejected with 422.
5. DrawOut.assignmentHistory (dto.ts:125) is declared but never set.
6. DrawJurorsPanel.tsx:89 chains ! assertions on assignmentHistory. The page crashes if that data is ever missing during the refusal period.
7. Other current jurors can see who refused and when (cases.controller.ts:115). Names were already visible to them; the refusal itself is new information. This is a privacy choice to confirm.

Security check of the backend endpoints: no bypass found

Probes P2 and P3, against a live backend:

- /replace:
  - Rejected with 403 for another creator, a juror, a plain user, and a request without the CSRF token.
  - Rejected with 409 for an occupied seat or a position outside the panel.
  - Rejected with 422 for a refused juror, an already seated juror, an admin, a plain user, a non-existent user, a string position, or an extra field such as selectedById.
- /refuse:
  - Rejected with 403 for the case creator and an admin who aren't jurors on the case.
  - Returns 404 to another creator and on a second refusal.
  - Rejected with 409 after the juror's refusal window closes (probe P4: 60-second window, waited 62 s).
- A refused juror loses all access:
  - Voting and viewing the case return 404.
  - The case disappears from their case list.
  - The candidate list returns 403.
- Voting during the refusal period: 409.
- Removing the juror role from someone seated in a refusal-period case: 409. Once they have refused, it is allowed.
- Concurrency:
  - Two simultaneous replacements of the same seat give 200 and 409, and the history stays consistent.
  - Two different jurors refusing at the same time both succeed.
- After the refusal window: voting opens with the full voting window, and the case resolves "A" after the vote (P4).

In the diff but not asked for by the brief

- A configurable refusal window per case (60 s to 30 days, default 24 h), with new form fields.
- /draw now returns the full case detail including history, which changes the response of an existing endpoint.
- A "Refresh case" button, a "refused" notice on the case list, and the confirmation dialog.
- Updates to RUN_LOG.md and NEXT_STEPS.md.
- Recording who selected each juror on the initial draw. This one supports the traceability requirement.