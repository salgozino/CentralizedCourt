#!/usr/bin/env bash
# Print the final cleanup inventory; it changes nothing.
set -uo pipefail
root="$(git rev-parse --show-toplevel)"
section() { printf '\n## %s\n' "$1"; }
echo "# time: $(date -Iseconds)"
section "worktrees"; git -C "$root" worktree list
section "branches"; git -C "$root" branch -a
section "stashes"; git -C "$root" stash list
section "crontab"; crontab -l 2>&1
section "user timers"; systemctl --user list-timers --no-pager 2>&1
section "dev servers on 8000/5173"; (ss -ltnp 2>/dev/null | grep -E ':(8000|5173)\b') || echo "none"
section "gh auth"; gh auth status 2>&1
section "env files (names only, not read)"; ls -1 "$root"/backend/.env* 2>/dev/null
