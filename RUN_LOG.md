# Run & Cost Log

One entry per task. Commit at the start and end of each task.
Quota: copy the usage/cost shown by the harness when the task ends.

## Summary

| Task | Model / harness / effort | Elapsed | Human time | Quota | Rework rounds | Accepted | Escaped defects |
|------|--------------------------|---------|------------|-------|---------------|----------|-----------------|
| T1 — Slice 1 | gpt-6-astra / pi / default | 16m 37s | not measured | $3.023980 harness-reported delta | 4 validation fixes | Automated checks pass; human review pending | Unlimited verify attempts (user validation; fixed in T2) |
| T2 — Verify attempt limit | gpt-6-astra / pi | 5m 36s | not measured | $1.439262 harness-reported delta | 1 user-reported defect | Automated checks pass; user revalidation pending | See ACCEPTANCE.md |

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

### T2 — Escaped defect: unlimited verification attempts
- Starting commit: f3353d0c19f1605e3f8b458a0e1e819dfdd6e150
- Session ID: 01a0fcfa-e250-71c2-89dc-5c2cec195d48
- Model / harness: gpt-6-astra / pi
- Start: 2026-10-02T16:17:22.330735+00:00 (baseline `make test` passed)
- Usage baseline: `usage/verify-limit-start.json`; harness-reported usage, not provider quota.
- Human intervention: user reported missing verify attempt limit after slice1 validation.
- Plan: persistent per-account budget, five verification attempts per ten-minute window; reissuing codes cannot reset the budget; atomic database updates; generic 401 on denial.
- End: 2026-10-02T16:22:57.904281+00:00; elapsed 335.57 seconds (5m 36s), excluding log closure.
- Checks: `make test` (44 backend + 17 frontend); `make build`; `make lint`; `make e2e` including 20 concurrent HTTP verification failures and correct-code rejection after reissue; Django system/migration-drift checks; `git diff --check`. All passed; existing bundle-size warning remains.
- Migration: `accounts.0002` adds account-wide counters; applied using `make migrate`.
- Regression coverage: failures commit the counter, fifth attempt can succeed, subsequent correct codes are blocked, reissue/new sessions/case changes cannot bypass, independent account budgets, attempts before code issuance, exact window expiry and retries not extending it.
- Final snapshot: `usage/verify-limit-end.json`; delta 9,504 input + 4,743 output + 1,107,072 cache-read = 1,121,319 tokens; harness-reported cost delta $1.439262. Subsequent log closure/final reply excluded; not provider quota.
- Fix commit: `60b0a6f`; user revalidation pending. Escaped defect recorded in `ACCEPTANCE.md`.
- Limitations: account lockout is temporary and counts successful verifications too. IP/global abuse controls and request-code delivery throttling are separate hardening work; this fix bounds guesses even when codes are reissued.
