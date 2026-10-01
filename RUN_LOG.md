# Run & Cost Log

One entry per task. Commit at the start and end of each task.
Quota: copy the usage/cost shown by the harness when the task ends.

## Summary

| Task | Model / harness / effort | Elapsed | Human time | Quota | Rework rounds | Accepted | Escaped defects |
|------|--------------------------|---------|------------|-------|---------------|----------|-----------------|
| T1 Slice 1 | Opus 5.5 / Pi gentle-shell ODD | 17m 18s | | out 59,432 · cache w 159,876 · cache r 3,175,467 tok | 1 | pending | |

## Entries

### T1 — Slice 1: Login + roles
- Date: 2026-10-01
- Branch: `feat/slice1/gentle`
- Starting commit: `0b1216a2174f1abf183dd9c2c3a796f5314ffea0`
- Session ID (Pi / gentle-shell): `01a0f908-7d43-7571-9dab-6e578cacee61`
- Acceptance criteria: #1 (both Login + roles rows in ACCEPTANCE.md) + `slice1.md`
- Model / harness / effort: Claude Opus 5.5 / Pi gentle-shell (el Gentleman, ODD) via Claude Max bridge
- Prompt / skills / workers: ODD with task file `odd/tasks/slice1-login-roles.md`
  (local, gitignored). 5 `gentle-ai-worker` runs (one per task + one fix),
  2 `gentle-ai-verify` runs (scaffold, live e2e). Skill: react-best-practices.
- Start – end: 2026-10-01 17:02:39 -03 – 17:19:57 -03 (elapsed: 17m 18s, until docs;
  excludes final native review)
- Intervention time:
- Quota snapshot at start (tokens, deduped by message id, all transcripts in
  `~/.claude/projects/-home-koki-cc-experiments-attempt-a-odd/`, subagents included;
  harness reports $0 cost because of the Max plan):
  - messages 22 · input 44 · output 9,926 · cache write 55,623 · cache read 780,081
  - Command: `cat ~/.claude/projects/-home-koki-cc-experiments-attempt-a-odd/*.jsonl | jq -s '[.[] | select(.message.usage and .message.id)] | unique_by(.message.id) | {messages: length, input: (map(.message.usage.input_tokens)|add), output: (map(.message.usage.output_tokens)|add), cache_write: (map(.message.usage.cache_creation_input_tokens)|add), cache_read: (map(.message.usage.cache_read_input_tokens)|add)}'`
- Quota snapshot at end (same command, 17:19:57 -03): messages 100 · input 200 ·
  output 69,358 · cache write 215,499 · cache read 3,955,548
- Quota consumed (end − start): messages 78 · input 156 · output 59,432 ·
  cache write 159,876 · cache read 3,175,467
- Checks executed: `make test` (65 backend, 19 frontend), `yarn build`, `yarn lint`,
  `manage.py check`, fresh-DB `make migrate`, seed twice, live curl e2e through the Vite
  proxy with real CSRF (all 9 users, negative code cases, admin 401/403/404/422).
- Rework: 1 round — live e2e found anonymous admin `PUT` returned 403 (CSRF) instead
  of 401; fixed in `b9a2c5f`.
- Result: pending human acceptance (manual browser check) — end commit: see git log
- Notes (decisions that needed my judgment):
  - Pre-start: deleted local `backend/db.sqlite3` (had default `auth`/`admin` migrations
    applied) so the custom `AUTH_USER_MODEL` can ship in the first migration.
  - Role storage as boolean flags on `User` (no Role table / Django groups).
  - Request-code email typed as plain `str` (contract literal), not validated format.
  - New code requests do not invalidate older unexpired codes.
  - CSRF kept on for logged-in unsafe calls; SPA reads `csrftoken` cookie.

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
