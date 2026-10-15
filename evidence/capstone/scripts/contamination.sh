#!/usr/bin/env bash
# Print contamination checks for the reviewer worktree: contamination.sh <reviewer-worktree>
set -uo pipefail
wt="${1:?usage: $0 <reviewer-worktree>}"
root="$(git rev-parse --show-toplevel)"
echo "# time: $(date -Iseconds)"
echo "# candidate (bundle): $(cat "$root/evidence/capstone/review/candidate.sha" 2>/dev/null)"
echo "# reviewer HEAD: $(git -C "$wt" rev-parse HEAD)"
echo "# diff sha256 recorded: $(cat "$root/evidence/capstone/review/diff.patch.sha256" 2>/dev/null)"
for p in evidence odd .atl day5.md; do
  if [ -e "$wt/$p" ]; then echo "LEAK: $wt/$p present"; else echo "ok: $p absent"; fi
done
echo "# reviewer worktree changes (should be only install/test artifacts):"
git -C "$wt" status --porcelain
echo "# brief and prompt commit order:"
git -C "$root" log --format='%h %cI %s' -- evidence/capstone/REPORT.md evidence/capstone/reviewer-prompt.md evidence/capstone/reviewer-pass1.md evidence/capstone/reviewer-pass2.md
