# Run & Cost Log

One entry per task. Commit at the start and end of each task.
Quota: copy the usage/cost shown by the harness when the task ends.

## Summary

| Task | Model / harness / effort | Elapsed | Human time | Quota | Rework rounds | Accepted | Escaped defects |
|------|--------------------------|---------|------------|-------|---------------|----------|-----------------|
| T1 Slice 1 | Opus 5.5 / Pi gentle-shell ODD + RDD native review | 37m 46s | | out 142,571 · cache w 375,382 · cache r 14,000,622 tok | 2 | pending | |

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
- Start – end: 2026-10-01 17:02:39 -03 – 17:40:25 -03 (elapsed: 37m 46s, including
  native review; implementation + docs alone took 17m 18s)
- Intervention time:
- Quota snapshot at start (tokens, deduped by message id, all transcripts in
  `~/.claude/projects/-home-koki-cc-experiments-attempt-a-odd/`, subagents included;
  harness reports $0 cost because of the Max plan):
  - messages 22 · input 44 · output 9,926 · cache write 55,623 · cache read 780,081
  - Command: `cat ~/.claude/projects/-home-koki-cc-experiments-attempt-a-odd/*.jsonl | jq -s '[.[] | select(.message.usage and .message.id)] | unique_by(.message.id) | {messages: length, input: (map(.message.usage.input_tokens)|add), output: (map(.message.usage.output_tokens)|add), cache_write: (map(.message.usage.cache_creation_input_tokens)|add), cache_read: (map(.message.usage.cache_read_input_tokens)|add)}'`
- Quota snapshot at end (same command, 17:19:57 -03): messages 100 · input 200 ·
  output 69,358 · cache write 215,499 · cache read 3,955,548
- Quota consumed until docs (17:19:57): messages 78 · input 156 · output 59,432 ·
  cache write 159,876 · cache read 3,175,467
- Quota snapshot after native review (17:40:25, same command but globbing
  `~/.claude/projects/-home-koki-cc-experiments-attempt-a-odd*/` to include the
  review worktree transcripts): messages 175 · input 350 · output 152,497 ·
  cache write 431,005 · cache read 14,780,703
- Quota consumed total (end − start): messages 153 · input 306 · output 142,571 ·
  cache write 375,382 · cache read 14,000,622. Caveat: native-review reviewer runs
  (Pi host relay) may not all land in these transcripts.
- Checks executed: `make test` (65 backend, 19 frontend), `yarn build`, `yarn lint`,
  `manage.py check`, fresh-DB `make migrate`, seed twice, live curl e2e through the Vite
  proxy with real CSRF (all 9 users, negative code cases, admin 401/403/404/422).
- Rework: 2 rounds.
  - Live e2e found anonymous admin `PUT` returned 403 (CSRF) instead of 401; fixed in
    `b9a2c5f`.
  - Native review of `746b34c` found a CRITICAL login-code brute-force. First bounded
    correction (per-code attempt cap) was rejected by the targeted validator and the
    lineage escalated (`review-64a8d92662496083`). Stronger per-user throttle landed in
    `e76547f` and was approved.
- Native review (RDD, one lineage per work-unit commit, via detached review worktrees):
  `5c3e5bb` approved · `746b34c` escalated · `0c16b1e` approved · `0d5b364` approved ·
  `b9a2c5f` approved · `e76547f` approved (4 lenses). Advisory findings recorded in
  NEXT_STEPS.md.
- Result: pending human acceptance (manual browser check) — end commit: see git log
- Notes (decisions that needed my judgment):
  - Pre-start: deleted local `backend/db.sqlite3` (had default `auth`/`admin` migrations
    applied) so the custom `AUTH_USER_MODEL` can ship in the first migration.
  - Role storage as boolean flags on `User` (no Role table / Django groups).
  - Request-code email typed as plain `str` (contract literal), not validated format.
  - New code requests do not invalidate older unexpired codes.
  - CSRF kept on for logged-in unsafe calls; SPA reads `csrftoken` cookie.

### T5 — Day 5 capstone: held-back feature
- Date:
- Branch: `feat/capstone-day5` (worktree `../CentralizedCourt-capstone`)
- Starting commit: `03a2be7` (master)
- Evidence: `evidence/capstone/` (narrative in `REPORT.md`)
- Acceptance criteria: (`REPORT.md` sections 1–2)
- Model / harness / effort (implementer):
- Reviewer (provider / model / session): `REPORT.md` section 3
- Prompt / skills / workers:
- Start – end: (elapsed: )
- Intervention time: (clarifying, reviewing, inspecting, fixing)
- Quota consumed: implementer · reviewer (`REPORT.md` section 8)
- Checks executed: `evidence/capstone/checks/`
- Reviewer verdict: pass 1 · pass 2
- Rework:
- Contamination: (summary of `REPORT.md` section 7)
- Result: accepted / rejected / narrowed — end commit:
- Unfinished slice:
- Notes (decisions that needed my judgment):

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
