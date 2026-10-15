#!/usr/bin/env bash
# Run a check and keep its raw output as evidence: capture.sh <name> <command...>
set -uo pipefail
if [ "$#" -lt 2 ]; then
  echo "usage: $0 <name> <command...>" >&2
  exit 2
fi
name="$1"; shift
root="$(git rev-parse --show-toplevel)"
out="$root/evidence/capstone/checks/$name.txt"
{
  echo "# time: $(date -Iseconds)"
  echo "# commit: $(git rev-parse HEAD)"
  echo "# dirty: $(git status --porcelain | grep -v '^?? evidence/' | wc -l) files"
  echo "# command: $*"
  echo
} > "$out"
(cd "$root" && "$@") 2>&1 | tee -a "$out"
code=${PIPESTATUS[0]}
printf '\n# exit: %s\n' "$code" >> "$out"
echo "saved $out (exit $code)"
exit "$code"
