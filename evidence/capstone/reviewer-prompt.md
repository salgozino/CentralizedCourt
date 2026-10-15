# Reviewer prompt

Commit this file and `review/` **before** launching the reviewer. The prompt below is sent as is.

- Reviewer provider / model / harness:
- Reviewer worktree: (from `scripts/review-bundle.sh`)
- Candidate commit:
- diff.patch sha256:
- Prompt committed in:

## Pass 1 prompt (no implementer rationale)

```text
You are an independent reviewer of a change to the CentralizedCourt repository (NestJS backend, React frontend,
contract and Playwright suites). You are in a fresh session and have not seen how the change was made.

Inputs:
1. Task brief: <paste REPORT.md section 1>
2. Acceptance criteria: <paste the applicable ACCEPTANCE.md rows and the specs from REPORT.md section 2>
3. Diff: review/diff.patch (sha256 <hash>), applied in this worktree at commit <sha>.

Do:
- Read AGENTS.md first and follow its commands.
- Run the checks yourself: `make setup` if needed, then `make lint` and `make test`, plus any focused command
  you need to verify a criterion. Paste every command you ran with its tail output and exit code.
- For each acceptance criterion: PASS / FAIL / NOT VERIFIED, with the evidence (command output or file:line).
- List defects by severity (blocker, major, minor), each with file:line and how to reproduce.
- List anything in the diff not required by the brief.
- Do not modify files. Do not read git log or commit messages.

End with a verdict: ACCEPT / ACCEPT WITH FIXES / REJECT.
```

## Pass 2 message (optional anchoring experiment; send only after pass 1 is saved and committed)

```text
Here is the design context the implementer used: <necessary design decisions only, from 01/02>.
Revisit your pass 1 verdict. For each finding, say whether this context changes it and why. Rerun any check you
need. Keep findings that still hold even if the design explains them.
```
