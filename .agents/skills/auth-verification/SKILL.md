---
name: auth-verification
description: Verification steps to guarantee that a backend endpoint is applying the right permissions. Should be used to validate the guards when adding new endpoints to the backend.
license: MIT
compatibility: requires bash, curl, jq and the backend running in a port with its stdout captured to a file
metadata:
  author: kokialgo
  version: 1.0.0
allowed-tools: Bash(curl:*) Bash(.agents/skills/auth-verification/scripts/login-as.sh:*)
---

# Auth verification

Checks, over real HTTP, that one backend endpoint enforces the project guard order:

1. `401 Unauthorized` for anonymous requests
2. `403 CSRF check Failed` for authenticated unsafe requests (POST/PUT/PATCH/DELETE) without a valid `X-CSRFToken`
3. `403 <Role> role required` when the user lacks the role (admins always pass role checks)
4. `422` when the body is invalid
5. `2xx` otherwise

Each step must win over every step below it: an anonymous request with a bad body is still 401.

## Required inputs

Stop and ask for any that is missing; do not guess them from the code under test.

- **Endpoint**: method and path, e.g. `POST /api/cases`.
- **Role policy**: which roles may call it (`admin`, `creator`, `juror`, `user`). For per-user reads, also
  which records each role may see.
- **Bodies** (unsafe methods only): one invalid body and one valid body.
- **Backend URL** (`API_URL`, default `http://localhost:8000`) and **`BACKEND_LOG`**: the file receiving the
  backend stdout. Login codes are only printed there. If the running backend is not writing stdout to a file, ask
  the user to restart it with `make dev-backend > /tmp/backend.log 2>&1`; never restart it yourself.

## Steps

1. **Log in** each role you need with the script next to this file. Run it directly; never wrap it in `eval`,
   and do not rely on shell variables surviving between commands:

   ```bash
   BACKEND_LOG=/tmp/backend.log .agents/skills/auth-verification/scripts/login-as.sh creator
   # COOKIE_JAR=/tmp/centralized-court-auth/creator1@example.com.jar
   # CSRF_TOKEN=U2SKbtJh71rIrUXfT5uuuCznq0aJUa9l
   ```

   Copy the printed `COOKIE_JAR` and `CSRF_TOKEN` values as literals into the curl commands below, so every
   request in the transcript shows which session it used. Set `API_URL` the same way when the backend is not on
   `http://localhost:8000`.

   Roles: `admin`, `creator`, `creator2`, `juror`, `juror2`, `user`, or any seeded email. The script reuses a live
   session, so calling it again is cheap. Exit codes: 2 usage/missing input, 3 backend down, 4 no login code,
   5 verify failed, 6 wrong user or missing role.

2. **Build the matrix** before calling anything: one row per request below, with the expected status written
   down from the role policy, not from what the endpoint returns.

3. **Anonymous**, with the invalid body: expect 401.

   ```bash
   curl -s -w ' %{http_code}\n' -X POST -H 'Content-Type: application/json' -d '<invalid body>' http://localhost:8000/api/cases
   ```

4. **CSRF** (unsafe methods only): as a role WITHOUT permission and as one WITH it, omit `X-CSRFToken`.
   Expect 403 `CSRF check Failed` both times (CSRF is checked before the role).

   ```bash
   curl -s -w ' %{http_code}\n' -b /tmp/centralized-court-auth/creator1@example.com.jar -X POST \
     -H 'Content-Type: application/json' -d '<invalid body>' http://localhost:8000/api/cases
   ```

5. **Role**: every role without permission, with `-H 'X-CSRFToken: <CSRF_TOKEN>'` and the invalid body. Expect
   403 with the role message (the role is checked before validation).

6. **Validation**: an allowed role, with CSRF and the invalid body. Expect 422.

7. **Success**: every allowed role, including `admin`, with CSRF and the valid body. Expect 2xx.

8. **Visibility** (per-user reads only): read a record owned by another user (`creator2` vs `creator`). Expect
   404, not 403, so that the existence of the record is not leaked.

## Evidence

Report the matrix with the actual result of each row:

| # | Request | As | Expected | Actual | Detail |
|---|---------|----|----------|--------|--------|
| 1 | `POST /api/cases` invalid body | anonymous | 401 | 401 | `Unauthorized` |

The verification passes only when every row matches. Quote the response `detail`, not just the status.

## Stop or escalate

- **Any row mismatches**: stop and report it. Do not change the expectation to match the response, and do not fix
  the code within this skill. A fix follows the project TDD flow: red contract test in `contract-tests/` first.
- **The role policy is ambiguous** or contradicts `ACCEPTANCE.md`: ask the user.
- **The script exits 4** after a fresh login: the IP may be over the login-code cap (10 per 15 min). Wait or ask;
  never spoof `X-Forwarded-For` to get around it.
- **Never** read or write `backend/.env`, and never run this against a non-local backend.
