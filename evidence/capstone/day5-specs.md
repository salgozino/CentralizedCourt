# Day 5 — Agreed specification and clarification record

Specification concluded on 2026-10-15 after Q1–Q18 and explicit confirmation of the assignment-history design. Implementation has not started. The user requested that work stop at recording the specification.

Source brief: [day5.md](day5.md). Experiment report: [REPORT.md](REPORT.md#2-clarification).

## Agreed specification

### Applicability and configuration

- Only newly created manual-selection cases use the refusal lifecycle. All existing cases retain their old lifecycle, including manual cases awaiting their initial draw. Random-selection cases remain unchanged.
- Creators configure a separate refusal duration using days, hours and minutes. The form defaults to 24 hours; the duration is immutable after creation.
- New manual-case API requests require an explicit refusal duration from 60 seconds through 30 days. Random-case requests reject a supplied refusal duration.

### Refusal and voting

- Each juror's refusal window starts when that juror is drawn. Silence means continuing; explicit acceptance is unnecessary.
- Refusal is allowed only before the juror's own deadline. It closes at the exact deadline, even if the case is still waiting for another window or replacement. Refusal is unavailable during voting.
- Refusal requires no written explanation or administrator approval. A confirmation dialog explains the loss of juror access and permanent exclusion from further draws for the case.
- Refusal is final: no withdrawal, undo or administrator override.
- Voting starts for the whole panel only when every seat is filled and every current juror's refusal window has expired.
- The logical voting start is the latest current juror's refusal deadline. All current jurors receive the full voting duration and share a deadline calculated from that start, regardless of when the next request occurs. A late visit may find voting already expired.

### Replacement

- Refusal leaves that seat vacant until the creator or an administrator manually chooses a replacement.
- Fill vacancies individually, selecting one eligible candidate for the specific seat. Occupied seats cannot be changed through this flow.
- Apply existing candidate eligibility rules and exclude everyone previously drawn for this case, including refusing jurors.
- Each replacement gets a full refusal window and can also refuse. Repeated replacement/refusal is supported.
- Vacancies wait indefinitely, including when the eligible pool is exhausted. This feature adds no automatic draw, cancellation or timeout.

### Permissions and history

- Refusal removes assignment-based case access and voting rights. Independent creator/admin access and replacement powers remain.
- A current seat blocks juror-role removal during refusal and voting. A refused historical assignment does not.
- The creator, administrators and current jurors can view full assignment history.
- Preserve each assignment permanently with case, seat position, juror, selecting actor, draw timestamp, refusal deadline and refusal timestamp when applicable.
- Refusal updates the original assignment. A replacement creates a new assignment linked to the predecessor it replaces. Repeated replacements form a chain for the same seat; this flow never overwrites or deletes earlier assignments.
- Reconstruct history from these durable assignment records rather than application logs. A separate general-purpose audit system is not required.
- Historical assignments grant no juror permissions and do not count toward voting, resolution or active-case role-removal restrictions.

### Verification requirements for later implementation

- Follow the repository's strict TDD workflow: red-test commit before behavior changes, followed by green commits.
- Cover backend behavior, HTTP contracts, permission guards and browser flows crossing the API.
- Verify exact refusal cutoffs, silent continuation, replacements with fresh windows, repeated refusals, prior-juror exclusions, multiple vacancies and pool exhaustion.
- Verify shared voting start/deadline, late requests, resolution using only current seats, access loss, retained creator powers, role-removal restrictions and history visibility.
- Verify configuration validation and preservation of existing-case and random-draw behavior.
- `make test` and `make lint` must pass before later implementation is considered complete. Neither has been run as evidence of implementation in this specification session.

## Clarification record

Questions below reproduce the question bodies asked in this session. For tool-based questions, answers reproduce the selected labels. A “Yes (Recommended)” accepts the accompanying recommendation, recorded in the resulting specification. Later answers supersede earlier recommendations where stated.

### Q1 — Separate refusal period

**Question:** Should every case have a refusal period before voting begins, with jurors who remain silent automatically continuing?

**Recommendation:** Yes. Voting opens after that period closes; explicit acceptance is unnecessary.

**Answer:** “That period should exist only for manual draw cases.”

**Result:** Manual cases only; the timing and silence behavior were confirmed in Q5. Q14 further restricts applicability to new cases.

### Q2 — Who chooses replacements

**Question:** Should replacements be drawn automatically from eligible jurors, excluding everyone previously assigned to that case?

**Recommendation:** Yes. No manual selection, and a refusing juror cannot be drawn again for the same case.

**Answer:** “Replacement it's done by admin/creator manually as in the initial draw. Already drawn jurors should be excluded”

**Result:** Manual replacement by admin/creator; exclude all previously drawn jurors. The automatic-draw recommendation was rejected.

### Q3 — Historical access

**Question:** Should a refusing juror lose case access and voting rights while their assignment and refusal remain recorded?

**Answer:** “yes”

**Result:** Retain history, remove juror access and voting rights. Q17 clarifies independent creator/admin permissions.

### Q4 — Refusal explanation

**Question:** Should declaring a conflict be sufficient, without requiring a written explanation or administrator approval?

**Recommendation:** Yes. Record who refused and when, linked to the replacement draw. Avoid collecting potentially sensitive conflict details.

**Answer:** “yes”

**Result:** No explanation or approval required.

### Q5 — Period timing

**Question:** Should each manually selected juror get a refusal window starting when drawn, with voting beginning for the whole panel only after every current juror’s window has expired and all vacancies are filled? Silence means the juror continues.

**Answer:** “Yes (Recommended)”

**Result:** Each replacement gets a full refusal window; the complete panel then gets one shared voting deadline.

### Q6 — Configuration

**Question:** Should the creator configure a separate refusal duration when creating a manual-draw case, using days/hours/minutes like the existing voting duration?

**Answer:** “Yes (Recommended)”

**Result:** Configurable duration for manual cases; random cases have no refusal period.

### Q7 — Vacant seats

**Question:** Should a refusal leave a vacant seat until the admin or creator manually fills it, with the case waiting indefinitely if no eligible replacement is available?

**Answer:** “Yes (Recommended)”

**Result:** Show vacancies and available candidates; no automatic cancellation, fallback draw or timeout.

### Q8 — Refusal cutoff

**Question:** Should each juror be allowed to refuse only before their own refusal deadline, even if the case is still waiting for another juror or a replacement? At the exact deadline, refusal is closed.

**Answer:** “Yes (Recommended)”

**Result:** Firm individual cutoff; no refusal during voting.

### Q9 — Duration limits

**Question:** Should refusal duration use the same limits as voting (1 minute to 30 days), default to 24 hours in the form, and become immutable once the case is created?

**Answer:** “Yes (Recommended)”

**Result:** These bounds, default and immutability are agreed.

### Q10 — History access

**Question:** Should the creator, admins, and current jurors see the full assignment history: who selected each juror, draw/refusal times, and which replacement filled each refused seat?

**Answer:** “Yes (Recommended)”

**Result:** History appears within authorized case details; refusing jurors lose assignment-based access.

### Q11 — Replacement flow

**Question:** Should the admin or creator fill each refused seat individually, choosing one eligible replacement for that specific seat without waiting to fill every vacancy at once?

**Answer:** “Yes (Recommended)”

**Result:** Each replacement's window starts immediately; occupied seats cannot be changed.

### Q12 — Final refusal

**Question:** Should refusal be final, with a confirmation dialog explaining the loss of access and permanent exclusion from this case before it is submitted?

**Answer:** “Yes (Recommended)”

**Result:** No withdrawal, undo or administrator override.

### Q13 — Role removal

**Question:** Should a current panel seat block removal of the juror role during both refusal and voting, while a refused historical seat no longer blocks it?

**Answer:** “Yes (Recommended)”

**Result:** Current panel membership remains protected through both phases.

### Q14 — Existing cases

**Question:** Should existing voting/resolved cases keep their phase and deadlines, while existing manual cases awaiting their initial draw receive a 24-hour refusal duration?

**Answer:** “New cases only”

**Selected option:** “All existing cases keep the old lifecycle, including manual cases not yet drawn.”

**Result:** No refusal lifecycle backfill for existing cases. The proposed 24-hour backfill was rejected.

### Q15 — Voting start

**Question:** Should voting logically start at the latest current juror’s refusal deadline, even if nobody opens the case until later?

**Answer:** “Yes (Recommended)”

**Result:** Calculate the shared voting deadline from that timestamp; late visits may find voting already expired.

### Q16 — API validation

**Question:** Should new manual-case API requests require an explicit refusal duration of 60 seconds to 30 days, and should random-case requests reject a supplied refusal duration? The UI will supply the 24-hour manual default.

**Answer:** “Yes (Recommended)”

**Result:** Explicit API duration; legacy database cases remain exempt.

### Q17 — Creator access

**Question:** If the creator is also selected as a juror and refuses, should they retain creator access and replacement powers while losing their juror seat and voting rights?

**Answer:** “Yes (Recommended)”

**Result:** Refusal removes assignment-derived permissions; independent creator/admin permissions remain.

### Q18 — Traceability storage

**Question:** Should we preserve every assignment permanently and link replacements to the refused assignment they replace?

**Recommendation:** Each assignment records case, seat position, selected juror, selecting actor, draw timestamp, refusal deadline, refusal timestamp when applicable, and predecessor assignment for replacements. Refusal updates the original assignment; replacement creates a linked assignment. Repeated refusals form a seat-specific chain. Earlier assignments are never overwritten or deleted by this flow. Reconstruct history from these records rather than logs; a separate general-purpose audit system is unnecessary. Only current assignments grant juror permissions or participate in voting.

**Answer:** “Yes, each assignment records all that info.”

**Result:** Durable linked assignment records are the agreed traceability mechanism.

## Completion log

- 2026-10-15: Completed Q1–Q17 covering lifecycle, configuration, replacements, permissions, migration compatibility and API validation.
- 2026-10-15: User identified traceability storage as an unasked decision. Added Q18; user confirmed all proposed assignment fields and linked history.
- 2026-10-15: Specification concluded and recorded with all 18 questions and answers. User instructed the session to stop before implementation.
- 2026-10-15T15:18:25-03:00: Specs session closed at the user's request. Implementation will take place in a new session.
- This record contains no claim of implemented behavior, passing implementation checks or accepted delivery.
