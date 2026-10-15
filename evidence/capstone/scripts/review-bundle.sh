#!/usr/bin/env bash
# Build the reviewer inputs without implementer rationale: review-bundle.sh [base]
set -euo pipefail
base="${1:-master}"
root="$(git rev-parse --show-toplevel)"
dir="$root/evidence/capstone/review"
sha="$(git rev-parse HEAD)"
wt="$(dirname "$root")/CentralizedCourt-review"
mkdir -p "$dir"
git diff "$base"...HEAD -- . ':(exclude)evidence' > "$dir/diff.patch"
sha256sum "$dir/diff.patch" | cut -d' ' -f1 > "$dir/diff.patch.sha256"
git diff --stat "$base"...HEAD -- . ':(exclude)evidence' > "$dir/diff.stat"
echo "$sha" > "$dir/candidate.sha"
if [ ! -d "$wt" ]; then
  git worktree add --detach "$wt" "$sha"
fi
# The reviewer must not see the evidence folder (clarification and feature doc carry rationale).
rm -rf "$wt/evidence"
echo "candidate $sha, diff sha256 $(cat "$dir/diff.patch.sha256"), reviewer worktree $wt"
