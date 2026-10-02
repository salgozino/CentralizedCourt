# CentralizedCourt

Local-only dispute resolution demo. Slice 1 implements passwordless login and
roles; cases, jury selection and voting are intentionally not implemented yet.

## Run locally

Requirements: Python 3.12, Node/Yarn versions pinned in `frontend/package.json`.
Create `backend/.env` yourself with `DJANGO_SECRET_KEY` set (see the example file).
Do not commit it.

From the repository root:

```sh
make setup
make migrate
make seed
```

Then, in separate terminals:

```sh
make dev-backend
make dev-frontend
```

Open http://localhost:5173. Use `admin@example.com`, `creator1@example.com`,
`creator2@example.com`, `juror1@example.com` through `juror5@example.com`, or
`user@example.com`. Request a code and copy the six digits from the backend line:

```text
LOGIN CODE <email> <code>
```

Codes are single-use, expire after ten minutes, and requesting a new code
invalidates the previous one. Only existing accounts can log in. Unknown emails
receive the same API response but no console code. Codes are stored as keyed
hashes; login creates a Django session cookie.

The admin screen can assign/remove creator and juror roles. It cannot alter the
admin role. Users can hold multiple roles. Use **Refresh profile**, reload, or
refocus the user's tab to see permissions changed in another session. Backend
permissions always use current database roles, regardless of what the UI shows.
Running `make seed` again preserves all existing accounts and their roles.

### Existing scaffold databases

The project now defines `AUTH_USER_MODEL = 'accounts.User'` in the initial accounts
migration. A database previously migrated with Django's default `auth.User` cannot
be reused as-is. Stop Django, back up that database, and use a fresh local database;
do not delete a database containing useful data. For a separate database, set
`DJANGO_DB_PATH` to an absolute SQLite path before migration and server startup.

## Checks

```sh
make test    # Django contract/security tests and React interaction tests
make build  # TypeScript + production Vite bundle
make lint
make e2e    # Real headless browser, frontend proxy, Django and console codes
```

`make e2e` needs Chrome at `/usr/bin/google-chrome`, or `CHROME_PATH` pointing to a
Chrome/Chromium executable. Stop development servers first: the script owns ports
8000 and 5173. It migrates/seeds a temporary database, exercises all nine seeded
accounts and admin role changes across sessions, and cleans up its servers and
database. It does not modify the normal development database.

## API and security scope

Contract: [`slice1.md`](slice1.md). OpenAPI: http://localhost:8000/api/docs.
For a browser or other client making mutations, first GET `/api/auth/csrf`, retain
cookies, and send the `csrftoken` cookie value in the `X-CSRFToken` header. Re-read
the cookie after login because Django rotates it. CSRF protection applies to
login/logout and authenticated role changes.

This is a local demo, not an internet-facing authentication service. Console codes
are intentional. Production deployment would additionally require login/request
rate limiting, delivery of codes over a private channel, HTTPS/cookie and host
configuration, operational logging and deployment hardening. Vite currently warns
about a >500 kB chunk from the UI-library dependency; the production build passes.
