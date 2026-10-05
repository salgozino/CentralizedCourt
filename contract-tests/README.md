# contract-tests

Black-box HTTP contract suite for the CentralizedCourt API under `/api/`. It only speaks HTTP
and reads the backend process stdout. It was written against the original Django backend (the
oracle, commit `38a27a1`) and now verifies the NestJS backend in `backend/`.

## Running

```sh
make setup           # installs contract-tests deps too
make test-contract
```

The harness runs `yarn build` in `backend/` once, then `node dist/cli/migrate.js`,
`node dist/cli/seed.js` and `node dist/main.js` with `PORT`, `DB_PATH` (temp DB) and a dummy
`SECRET_KEY` in the child env. The readiness probe accepts any HTTP status.

## How it works

- `src/globalSetup.ts` starts the backend once per Jest run (`--runInBand`) on a free port with a
  fresh temp SQLite DB (`DB_PATH`), runs `migrate` and `seed` first, and waits until
  `/api/me` answers. `src/globalTeardown.ts` stops it and removes the temp dir.
- Backend stdout goes to a file; `src/stdout.ts` reads `LOGIN CODE <email> <code>` lines from it
  (latest code for an email, optionally only what was printed after a mark).
- `src/client.ts` is a simulated browser: its own cookie jar (`sessionid`, `csrftoken`), its own
  IP through `X-Forwarded-For` (the server sees 127.0.0.1, so the last entry is trusted), and
  `Origin: http://localhost:5173` on every request. Unsafe requests send `X-CSRFToken` from the
  jar unless `csrf: false`.
- Isolation: every `Client` gets a distinct IP (`newIp()`, namespaced per test file), so tests
  that consume IP caps never interfere. Admin tests that change roles restore the seed roles
  afterwards. Nothing reads or writes `backend/.env` or the dev DB.

## Observed Django responses (the contract the backend must match)

| Case | Status | Body |
| --- | --- | --- |
| Anonymous `/api/me`, `/api/admin/*` | 401 | `{"detail": "Unauthorized"}` |
| Non-admin on `/api/admin/*` | 403 | `{"detail": "Admin role required"}` |
| Wrong/expired/foreign code | 401 | `{"detail": "Invalid or expired code"}` |
| CSRF failure (missing token or untrusted Origin) | 403 | `{"detail": "CSRF check Failed"}` |
| Unknown user id on PUT roles | 404 | `{"detail": "Not Found"}` |
| Malformed JSON body (any endpoint) | 422 | `{"detail": "Cannot parse request body"}` |
| Schema violation, e.g. `{}` on request-code | 422 | `{"detail": [{"type": "missing", "loc": ["body", "payload", "email"], "msg": "Field required"}]}` |
| Missing body entirely | 422 | `{"detail": [{"type": "missing", "loc": ["body", "payload"], "msg": "Field required"}]}` |
| Invalid role, e.g. `["admin"]` | 422 | `{"detail": [{"type": "literal_error", "loc": ["body", "payload", "roles", 0], "msg": "Input should be 'creator' or 'juror'", "ctx": {"expected": "'creator' or 'juror'"}}]}` |

Plain-string messages are asserted exactly (CSRF only by substring "CSRF", as in pytest). The
pydantic-style 422 arrays are asserted by status only (the frontend does not read them); their
shapes are recorded here for reference.

Other observations:

- `POST /api/auth/logout` needs no CSRF token (the route is unauthenticated); it answers 200
  `{"detail": "Logged out"}` with or without a session. Not asserted beyond the pytest cases.
- `request-code` sets a `sessionid` cookie (the session stores the code ids) when the email exists;
  login rotates it.
- Throttle buckets for requests whose last `X-Forwarded-For` entry is not an IP fall back to the
  socket address `127.0.0.1`, which all such requests share.

## Not covered here ("covered by backend unit tests")

These need direct DB access, clock control, or a non-loopback socket address:

- Code expiry (`test_expired_code`) and request-cap window expiry (`test_request_cap_window_expires`).
- Hash storage: sha256 hex of the code, never the plain code (DB assertions of
  `test_request_code_prints_single_line`), `LoginCode`/`LoginEvent` row counts and
  `failed_attempts` values (`test_request_code_unknown_email`,
  `test_attacker_guesses_do_not_burn_victim_code`; the behavioural half, the victim can still
  log in, is covered).
- Stored throttle IPs (`LoginEvent.ip`) in the X-Forwarded-For tests; the behavioural half (which
  bucket gets charged) is covered.
- `X-Forwarded-For` ignored when the socket address is not `127.0.0.1`/`::1`
  (`test_forwarded_for_not_trusted`, first case): cannot be simulated over loopback.
- Direct `REMOTE_ADDR` clients (`10.0.0.x` without a proxy): replaced by `X-Forwarded-For` clients.
- `test_target_admin_stays_admin` creates a second admin via the ORM; the contract-level rule is
  covered through the seeded admin editing their own roles to `[]`.
