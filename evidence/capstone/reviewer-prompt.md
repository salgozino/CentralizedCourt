# Reviewer prompt

Commit this file and `review/` **before** launching the reviewer. The prompt below is sent as is.

- Reviewer provider / model / harness: Claude Code Opus 5.5 Medium
- Reviewer worktree: (from `scripts/review-bundle.sh`): CentralizedCourt-review
- Candidate commit: 5366bc73786c4c5710e7f112530d497783afcda4
- diff.patch sha256: d75fec56e6f4770d76a525b21903caf3ac19c9ddd9b2b5983ff544738a740333
- Prompt committed in: 

## Pass 1 prompt (no implementer rationale)

```text
You are an independent adversarial reviewer of a change to the CentralizedCourt repository (NestJS backend, React frontend,
contract and Playwright suites). 

All the steps that you will perform should have a log record in ./evidence/capstone/checks/validation.txt

Inputs:
1. Task brief: Adding a period where the juror can refuse to arbitrate due to conflict of interest.
If that happens, record the decision and draw another juror from the pool.

2. Acceptance criteria:  A juror who refuses to arbitrate is replaced by another user with full traceability of the re-draw.
3. Diff: run `git diff 4457a20...HEAD -- . ':(exclude)evidence'` in this worktree (commit 5366bc7…);
      its sha256 must be d75fec56e6f4770d76a525b21903caf3ac19c9ddd9b2b5983ff544738a740333.
Do:
- Read AGENTS.md first and follow its commands.
- Run the checks yourself: `make setup` if needed, then `make lint` and `make test`, plus any focused command
  you need to verify a criterion. Paste every command you ran with its tail output and exit code.
- For each acceptance criterion: PASS / FAIL / NOT VERIFIED, with the evidence (command output or file:line).
- List defects by severity (blocker, major, minor), each with file:line and how to reproduce.
- List anything in the diff not required by the brief.
- Do not modify files. Do not read git log or commit messages.
- Do a security check on the backend enpoints to guarantee that permissions can not be be bypassed


End with a verdict: ACCEPT / ACCEPT WITH FIXES / REJECT.
```

## Pass 2 message (optional anchoring experiment; send only after pass 1 is saved and committed)

```text
Here is the design context the implementer used: <necessary design decisions only, from 01/02>.
Revisit your pass 1 verdict. For each finding, say whether this context changes it and why. Rerun any check you
need. Keep findings that still hold even if the design explains them.
```
