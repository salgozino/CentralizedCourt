#!/usr/bin/env bash
# Logs in as a seeded user and leaves a reusable cookie jar for curl.
#
# Usage: login-as.sh <admin|creator|creator2|juror|juror2|user|EMAIL>
#
# Environment:
#   BACKEND_LOG  Required. File that receives the backend stdout (login codes are printed there).
#   API_URL      Backend base URL. Default: http://localhost:8000
#   AUTH_DIR     Where cookie jars are kept. Default: ${TMPDIR:-/tmp}/centralized-court-auth
#
# Output (stdout, eval-able):
#   COOKIE_JAR=<path>   pass to curl with -b "$COOKIE_JAR"
#   CSRF_TOKEN=<value>  send as -H "X-CSRFToken: $CSRF_TOKEN" on POST/PUT/PATCH/DELETE
# Diagnostics go to stderr.
#
# Exit codes: 0 logged in, 2 usage, 3 backend unreachable, 4 no login code, 5 verify failed,
#             6 logged in as an unexpected user or without the expected role.

set -euo pipefail

API_URL="${API_URL:-http://localhost:8000}"
AUTH_DIR="${AUTH_DIR:-${TMPDIR:-/tmp}/centralized-court-auth}"

fail() {
  echo "login-as: $2" >&2
  exit "$1"
}

[[ $# -eq 1 ]] || fail 2 "usage: login-as.sh <admin|creator|creator2|juror|juror2|user|EMAIL>"
command -v curl >/dev/null || fail 2 "curl is required"
command -v jq >/dev/null || fail 2 "jq is required"

# Seeded users (backend/src/seed/seed.ts). expected_role is checked against /api/me.
case "$1" in
  admin) email=admin@example.com expected_role=admin ;;
  creator) email=creator1@example.com expected_role=creator ;;
  creator2) email=creator2@example.com expected_role=creator ;;
  juror) email=juror1@example.com expected_role=juror ;;
  juror2) email=juror2@example.com expected_role=juror ;;
  user) email=user@example.com expected_role="" ;;
  *@*) email="$1" expected_role="" ;;
  *) fail 2 "unknown role '$1'" ;;
esac

mkdir -p "$AUTH_DIR"
jar="$AUTH_DIR/$email.jar"

# Prints the /api/me body when the jar holds a live session, nothing otherwise.
# GET /api/me also (re)sets the csrftoken cookie.
current_user() {
  [[ -f "$jar" ]] || return 0
  local body status
  body=$(curl -sS -b "$jar" -c "$jar" -w '\n%{http_code}' "$API_URL/api/me") || fail 3 "backend unreachable at $API_URL"
  status=${body##*$'\n'}
  [[ "$status" == 200 ]] && printf '%s\n' "${body%$'\n'*}"
  return 0
}

print_session() {
  local me="$1" csrf
  [[ $(jq -r .email <<<"$me") == "$email" ]] || fail 6 "session belongs to $(jq -r .email <<<"$me"), not $email"
  if [[ -n "$expected_role" ]] && ! jq -e --arg r "$expected_role" '.roles | index($r)' >/dev/null <<<"$me"; then
    fail 6 "$email lacks role '$expected_role' (roles: $(jq -c .roles <<<"$me")); was it changed by an admin?"
  fi
  csrf=$(awk '$6 == "csrftoken" { token = $7 } END { print token }' "$jar")
  [[ -n "$csrf" ]] || fail 5 "no csrftoken cookie in $jar"
  echo "login-as: logged in as $(jq -c '{email, roles}' <<<"$me")" >&2
  echo "COOKIE_JAR=$jar"
  echo "CSRF_TOKEN=$csrf"
}

# Reuse a live session: login codes are throttled per IP, so do not request one when not needed.
me=$(current_user)
if [[ -n "$me" ]]; then
  print_session "$me"
  exit 0
fi

[[ -n "${BACKEND_LOG:-}" ]] || fail 2 "BACKEND_LOG is not set; start the backend with its stdout redirected to a file"
[[ -f "$BACKEND_LOG" ]] || fail 2 "BACKEND_LOG=$BACKEND_LOG does not exist"

rm -f "$jar"
mark=$(wc -c <"$BACKEND_LOG")

status=$(curl -sS -o /dev/null -w '%{http_code}' -b "$jar" -c "$jar" \
  -H 'Content-Type: application/json' -d "$(jq -nc --arg e "$email" '{email: $e}')" \
  "$API_URL/api/auth/request-code") || fail 3 "backend unreachable at $API_URL"
[[ "$status" == 200 ]] || fail 4 "request-code answered $status"

# The code line is printed by this request; read only what was written after the mark.
code=""
for _ in $(seq 1 25); do
  code=$(tail -c "+$((mark + 1))" "$BACKEND_LOG" |
    awk -v e="$email" '$1 == "LOGIN" && $2 == "CODE" && $3 == e { c = $4 } END { print c }')
  [[ -n "$code" ]] && break
  sleep 0.2
done
[[ -n "$code" ]] || fail 4 "no login code for $email in $BACKEND_LOG (unknown email, IP over the request cap, or wrong log file)"

status=$(curl -sS -o /dev/null -w '%{http_code}' -b "$jar" -c "$jar" \
  -H 'Content-Type: application/json' -d "$(jq -nc --arg e "$email" --arg c "$code" '{email: $e, code: $c}')" \
  "$API_URL/api/auth/verify") || fail 3 "backend unreachable at $API_URL"
[[ "$status" == 200 ]] || fail 5 "verify answered $status"

me=$(current_user)
[[ -n "$me" ]] || fail 5 "verify succeeded but /api/me does not see the session"
print_session "$me"
