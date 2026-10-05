# Roadmap

Where CentralizedCourt goes after the experiment, so that it can support the
**WIPO & Kleros prototype** (`WIPO & Kleros Prototype v1.0  (1).html`) without
breaking the original experiment.

Scope and acceptance for today's experiment stay in `EXPERIMENT.md` and
`ACCEPTANCE.md`. This document is a plan, not approved scope: every version below
needs its own acceptance list before work starts.

## Terminology

| Prototype term          | CentralizedCourt term                  |
| ----------------------- | -------------------------------------- |
| Expert / panelist       | Juror                                  |
| Expert roster           | Juror pool (a whitelist of jurors)     |
| WIPO case administrator | Admin                                  |
| Claimant                | Case creator (party)                   |
| Platform                | Respondent (party)                     |
| Opinion / decision      | Ruling                                 |

An expert is a juror. What changes between a normal case and a WIPO case is **how
jurors are selected and how the case is decided**, not who a juror is.

## Gap summary

The prototype and the experiment share the core: a centralized ODR, cases created
by authorized users, jurors assigned to them and a result visible to the parties.
They differ on the decision mechanism:

| Topic           | Experiment (v1)                           | WIPO prototype                                        |
| --------------- | ----------------------------------------- | ----------------------------------------------------- |
| Panel           | 3 jurors drawn at random (or manual)      | 1 expert, chosen manually by the administrator        |
| Juror pool      | Any user with the juror role              | A curated roster of experts                           |
| Outcomes        | Defined by the creator                    | Fixed: confirm, reverse, inadmissible                 |
| Decision        | Majority vote                             | Reasoned opinion by the single expert                 |
| Binding         | Binding result                            | Non-binding opinion                                   |
| Deadline starts | When the juror is drawn                   | When the expert accepts the appointment               |
| Parties         | Creator only                              | Claimant and platform (respondent)                    |

The prototype is a static mock-up: it declares no backend and uses fictitious data.
It shows the intended experience; it does not prove any of its features.

## Design principle: case procedures

Instead of hard-coding "3 random jurors and a majority vote", a case is opened
under a **procedure** that fixes the rules of the case. The creator picks the
procedure when opening the case; the procedure decides the rest.

| Setting             | `jury` procedure (default)        | `expert` procedure (WIPO)                   |
| ------------------- | --------------------------------- | ------------------------------------------- |
| Panel size          | N jurors, odd, default 3          | Exactly 1                                   |
| Selection           | Random draw (seeded) or manual    | Manual appointment by an admin              |
| Juror pool          | All users with the juror role     | A named whitelist pool (e.g. "WIPO experts")|
| Outcomes            | Defined by the creator            | Fixed by the procedure                      |
| Ruling rule         | Majority of votes                 | The single expert's ruling                  |
| Ruling content      | Vote (outcome only)               | Outcome plus written reasoning              |
| Binding             | Yes                               | No (shown as "non-binding opinion")         |
| Deadline starts     | On draw/assignment                | On assignment (on acceptance from v3)       |

A sketch of the resulting model (names are indicative):

```text
JurorPool    name, description, members -> User (must have the juror role)
Procedure    kind (jury | expert), panel_size, selection (random | manual),
             pool -> JurorPool (optional), fixed_outcomes (optional),
             requires_reasoning, binding, vote_window
Case         creator, respondent (optional), procedure, description,
             outcomes, status, result
Assignment   case, juror, assigned_at, deadline, (later) accepted_at
Ruling       assignment, outcome, reasoning (optional), submitted_at
```

Two rules keep the model honest:

- A juror can only be assigned if they have the juror role **and** belong to the
  procedure's pool (when it has one). "Expert from a whitelist" is just a pool.
- The case result is computed by the procedure's ruling rule. For `jury` that is the
  majority; for `expert` it is the single ruling. Nothing else in the system needs
  to know which one it was.

## Versions

Each version keeps every acceptance criterion of the previous ones passing.

### v1 — The experiment (current)

Exactly what `EXPERIMENT.md` describes: login with roles, create a case, draw or
assign 3 jurors, vote before the deadline, resolve by majority.

Only one forward-looking change is recommended, and only if it costs nothing:
when building slice 2, store the panel size and selection method on the case
(defaulting to 3 and random) instead of hard-coding them. Do **not** build the
`expert` procedure in v1.

Open decision carried over: tie-breaking when votes split (see `NEXT_STEPS.md`).

### v2 — Flexible case creation (minimum to run a WIPO-style case)

Goal: one system can run both a normal case and a WIPO case end to end.

1. **Procedures.** Introduce `jury` and `expert` procedures. The creator picks one
   when opening a case; the UI only asks for what the procedure leaves open
   (e.g. outcomes for `jury`, nothing for `expert`).
2. **Configurable jury size.** `jury` cases accept an odd N (1, 3, 5...) instead of a
   fixed 3, bounded by the number of eligible jurors.
3. **Juror pools (whitelists).** Admin creates pools and adds or removes jurors.
   Removing a juror from a pool does not affect cases they are already assigned to.
4. **Expert appointment.** For `expert` cases an admin picks one juror from the
   procedure's pool. Assignment validates role and pool membership on the backend.
5. **Reasoned ruling.** The expert submits one outcome from the fixed set plus a
   required written reasoning. The ruling is final once submitted.
6. **Respondent party.** A case may name a respondent user. Creator and respondent
   can see the case and its result; nobody else except admin and assigned jurors.
7. **Result display.** The result shows the procedure, the outcome, the reasoning
   (if any) and a "non-binding opinion" label for `expert` cases.

Acceptance sketch:

- A `jury` case with N=5 and a fixed seed always draws the same 5 eligible jurors;
  3 votes for "A" resolve it as "Resolved: A".
- An `expert` case cannot be assigned to a juror outside its pool (backend 4xx).
- An `expert` case cannot be assigned more than one juror.
- When the expert submits "Reverse" with reasoning before the deadline, the case
  becomes "Resolved: Reverse" and both parties see the reasoning.
- A ruling without reasoning is rejected for `expert` cases.
- The full v1 acceptance check still passes unchanged.

### v3 — A trustworthy process

Goal: the process is fair and auditable enough to put in front of real parties.
Several items were already stretch goals of the experiment.

1. **Audit log.** Every state change of a case (created, assigned, accepted, voted,
   ruled, resolved) is recorded with actor and timestamp and shown as a timeline.
2. **Evidence and exchange of arguments.** Parties upload documents. The respondent
   can answer within a window; the creator gets one reply. The case continues if the
   respondent does not answer.
3. **Conflict of interest and acceptance.** An appointed juror sees a short preview
   (no evidence), declares independence or a conflict, and accepts or declines.
   Declining frees the slot for a new appointment or draw. Decision needed: whether
   the deadline then starts on acceptance (prototype) or stays on assignment.
4. **Deadline management.** Acceptance window, reminders, extensions granted by the
   admin and reassignment when a juror misses their deadline.
5. **Notifications.** In-app notifications plus email (printed to the console while
   the system runs locally).
6. **Intake by admin.** New cases arrive as "submitted"; an admin admits them,
   rejects them with a reason, or asks the creator for more information before any
   juror is assigned.
7. **Appeals.** A `jury` case can be appealed once to a larger panel (e.g. 2N+1).
   The prototype does not include appeals; it remains an experiment stretch goal.

### v4 — WIPO specialization and integrations

Goal: the full experience the prototype describes. Each item needs its own
validation, several of them legal rather than technical.

- **Guided claim wizard:** eligibility checks, parallel proceedings, claimant and
  representative identity, the contested platform decision (URL, reference, date),
  internal complaint, facts, legal basis, requested remedy and declarations.
- **IP and DSA domain:** dispute categories (copyright, trademark, design), applicable
  law and platform terms, multiple languages.
- **Expert profiles:** specialization, languages, jurisdiction, availability, workload
  and known relationships, used when choosing an expert.
- **Ruling template:** structured sections, drafts, completeness checklist, PDF export.
- **Platform portal:** the respondent's case inbox, voluntary reversal or settlement
  before the ruling, and a compliance report (full, partial, none) within 30 days.
- **Party feedback:** anonymous rating of the process after the ruling.
- **Reporting:** volumes, admissibility, durations, outcomes, compliance; CSV export
  and periodic regulatory reports.
- **Public site:** landing page, FAQ, procedure rules, expert roster, privacy and
  accessibility documents.
- **AI assistant ("Pia" in the prototype):** evidence summaries, timelines and
  drafting help, always labelled, logged and disclosed, never deciding. The prototype
  uses canned answers, so this needs to be designed from scratch.
- **Integrations:** public API and webhooks for platforms, calendar sync, WhatsApp
  reminders.

## Out of scope

- **Billing and payments.** Fees, reimbursable expenses, juror remuneration,
  invoicing and transfers are out of every version above. The prototype mentions
  them; we deliberately leave them out of the flow.
- **Blockchain and economic incentives**, as in the original experiment.
- Legal claims made by the prototype (DSA certification, encryption, tamper-proof
  records) are not features we can tick off; they need legal and security work of
  their own.

## Open decisions

| Decision                                                       | Needed before |
| -------------------------------------------------------------- | ------------- |
| Tie-breaking rule for split votes                              | v1 slice 4    |
| Pools as named whitelists vs. a separate "expert" role         | v2            |
| Can an `expert` case use a random draw from its pool?          | v2            |
| Who can open `expert` cases: any creator or a dedicated role?  | v2            |
| Does the deadline start on assignment or on acceptance?        | v3            |
| Is a respondent a registered user or an external contact?      | v3            |
