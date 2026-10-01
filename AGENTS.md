# AGENTS.md

Instructions for coding agents working on CentralizedCourt. Read `EXPERIMENT.md` for
the product scope, `ACCEPTANCE.md` for the acceptance criteria and `NEXT_STEPS.md` for
the current state.

## Stack

- **Backend** (`backend/`): Python 3.12, Django 5.2 + django-ninja, SQLite.
  The Django project package is `config`; the API is mounted at `/api/`.
- **Frontend** (`frontend/`): Vite + React 18 + TypeScript + Tailwind v4 +
  `@kleros/ui-components-library`. React must stay on 18 (library peer dependency).
- **Package managers**: `pip` with a venv at `backend/.venv`; Yarn 4 with
  `nodeLinker: node-modules`. Node and Yarn are pinned with Volta in
  `frontend/package.json`. Do not use npm or pnpm in `frontend/`.

## Commands

Always use the root `Makefile` targets, run from the repository root:

| Command             | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `make setup`        | Creates `backend/.venv`, installs Python and JS deps |
| `make migrate`      | Applies Django migrations to the SQLite database     |
| `make dev-backend`  | Starts Django on http://localhost:8000               |
| `make dev-frontend` | Starts Vite on http://localhost:5173                 |
| `make test`         | Runs backend tests (pytest), then frontend (vitest)  |

First run: `make setup`, then `make migrate`.

- `dev-backend` and `dev-frontend` are long-running servers: start them in the
  background and stop them when done.
- The frontend proxies `/api` to the backend, so call the API with relative
  `/api/...` paths from the UI.
- API docs: http://localhost:8000/api/docs.
- Do not activate the venv; call `backend/.venv/bin/python` directly when you need
  `manage.py` (e.g. `cd backend && .venv/bin/python manage.py makemigrations`).

## Environment

The backend reads `backend/.env` (see `backend/.env.example`). `DJANGO_SECRET_KEY` is
required; Django will not start without it. Never commit `.env`, and do not read or
write it: ask the user to create or change it.

## Tests

- Backend tests live in `backend/tests/` (pytest + pytest-django).
- Frontend tests live next to the source as `*.test.ts(x)` (vitest).
- `make test` must pass before a task is considered done.
