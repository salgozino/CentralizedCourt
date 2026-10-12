# e2e

Browser end-to-end suite (Playwright, Chromium). It drives the real frontend against the real backend, so it
catches what the mocked frontend tests cannot: the UI and the API disagreeing on a shape.

## Running

```sh
make setup      # installs e2e deps and the Playwright Chromium build
make test-e2e   # also part of `make test`
```

Failures keep a screenshot and a trace under `test-results/`; open a trace with
`yarn playwright show-trace <path>/trace.zip`.

## How it works

- `src/globalSetup.ts` runs once per run (`src/servers.ts`): builds `backend/`, runs `migrate` and `seed` on a fresh
  temp SQLite DB (`DB_PATH`) with a dummy `SECRET_KEY`, starts `dist/main.js`, then starts Vite with
  `API_PROXY_TARGET` pointing its `/api` proxy at that backend. Both use free ports, so they do not clash with
  `make dev-backend` / `make dev-frontend`. Teardown stops both process groups and removes the temp dir.
- `src/fixtures.ts` exports `test` (with `baseURL` set to the Vite URL) and `login(page, email)`, which fills the
  login page and reads the code from the backend stdout (`LOGIN CODE <email> <code>`).
- One worker: specs share the backend and DB. Seeded users are listed in `backend/src/seed/`; give data a unique
  name (e.g. a timestamp in the title) instead of assuming an empty DB.

## Specs

- `tests/draw.spec.ts`: a creator creates a random case, draws the jury and sees the jurors by name (never email)
  with their deadlines, with no console errors.
