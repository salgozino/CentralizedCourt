# Run & Cost Log

One entry per task. Commit at the start and end of each task.
Quota: copy the usage/cost shown by the harness when the task ends.

## Summary

| Task | Model / harness / effort | Elapsed | Human time | Quota | Rework rounds | Accepted | Escaped defects |
|------|--------------------------|---------|------------|-------|---------------|----------|-----------------|

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
- End / elapsed: pending
- Intervention time: not measured
- Usage baseline: `usage/slice1-start.json`; cumulative harness tokens/cost, not provider quota.
- Quota consumed: pending final snapshot/diff
- Checks before start: `make test` (1 backend + 1 frontend); HTTP 200 for backend OpenAPI, Vite HTML and proxied OpenAPI.
- Notes: existing scaffold SQLite has migrations but zero users/sessions; preserve outside repository and recreate with custom AUTH_USER_MODEL before initial application migration. No .env access or changes.
- Result / end commit: pending
