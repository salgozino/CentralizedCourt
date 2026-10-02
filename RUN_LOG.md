# Run & Cost Log

One entry per task. Commit at the start and end of each task.
Quota: copy the usage/cost shown by the harness when the task ends.

## Summary

| Task | Model / harness / effort | Elapsed | Human time | Quota | Rework rounds | Accepted | Escaped defects |
|------|--------------------------|---------|------------|-------|---------------|----------|-----------------|
| T1 — Slice 1 | gpt-6-astra / pi / default | 16m 37s | not measured | $3.023980 harness-reported delta | 4 validation fixes | Automated checks pass; human review pending | None observed |

## Entries

<!-- Copy this template for each task

### T? — <slice name>
- Date:
- Starting commit:
- Acceptance criteria: (# from ACCEPTANCE.md)
- Model / harness / effort:
- Prompt / skills / workers:
- Start – end: (elapsed: )
- Intervention time: (reviewing, fixing, re-prompting)
- Quota consumed:
- Checks executed:
- Rework:
- Result: accepted / rejected — end commit:
- Notes (decisions that needed my judgment):

-->

### T1 — Slice 1: login + roles
- Date: 2026-10-02
- Branch: feat/slice1/gpt
- Starting commit: 0b1216a2174f1abf183dd9c2c3a796f5314ffea0
- Session ID: 01a0fcfa-e250-71c2-89dc-5c2cec195d48
- Acceptance criteria: slice1.md (all), ACCEPTANCE.md #1
- Model / harness / effort: gpt-6-astra / pi / harness default
- Prompt / skills / workers: user request + repository instructions; no workers
- Start: 2026-10-02T14:20:31.585814+00:00 (after scaffold validation)
- End / elapsed: 2026-10-02T14:37:08.543638+00:00 / 996.96 seconds (16m 37s); post-validation cutoff, excluding log closure.
- Intervention time: not measured
- Usage baseline: `usage/slice1-start.json`; cumulative harness tokens/cost, not provider quota.
- Usage final snapshot/diff: `usage/slice1-end.json`.
- Consumption delta: input 84,972; output 17,386; cache read 1,304,960; cache write 0; total 1,407,318 tokens. Reported reasoning: 1,187 (not added again to total).
- Cost delta reported by harness: $3.023980 ($0.849720 input + $0.869300 output + $1.304960 cache read). Provider quota/billing unavailable. Snapshot contains records available at the cutoff; subsequent log closure and final reply are excluded.
- Checks before start: `make test` (1 backend + 1 frontend); HTTP 200 for backend OpenAPI, Vite HTML and proxied OpenAPI.
- Checks after development: `make test` — 38 backend + 17 frontend passed; `make build`; `make lint`; `make e2e` — real Chrome, nine console-code logins, role sections, session persistence/logout, cross-session role grants/removals; Django system check and migration drift check; `git diff --check`. Final full run passed.
- Rework: validation caught Kleros Button prop mismatches, Django CSRF decorators needing Ninja's `decorate_view`, Vitest CSS dependency inlining, and the Button text API. Fixed before acceptance; no user re-prompting during implementation.
- Notes: scaffold database had zero users/sessions; preserved at `/tmp/court-scaffold-db-20261002T142032Z.sqlite3`. Fresh database migrated with custom AUTH_USER_MODEL and seeded. No .env access or changes. All started servers stopped. E2E uses an isolated temporary database.
- Decisions: implicit base role + independent extra roles; admin preserved on role replacement; latest login code only, keyed hash storage, atomic single-use consumption, ten-minute expiry; session/CSRF cookies instead of frontend tokens. Local-only scope, no rate limiting/private email delivery. Build has a non-blocking >500 kB UI-library chunk warning.
- Result: all implemented slice1 acceptance checks pass; human review/additional external tests pending.
- Start-log commit: ff663e6.
- Implementation/end commit: 672fc0b1be0adbf4d1dee6c01d27f3098654f16a. Final log and snapshots are committed separately.
