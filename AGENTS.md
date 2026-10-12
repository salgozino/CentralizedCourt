# AGENTS.md

Instructions for coding agents working on CentralizedCourt. Read `EXPERIMENT.md` for
the product scope, `ACCEPTANCE.md` for the acceptance criteria and `NEXT_STEPS.md` for
the current state.

## Development Flow

New features and changes to behavior (endpoints, guards, validation, business rules, UI flows) follow strict TDD:
first a commit with the red tests, then one or more commits that make them green.

Small self-contained changes (typos, copy or message text, renames, formatting, docs, config tweaks) skip the red
commit: update the affected tests in the same commit as the change. `make test` and `make lint` must still pass.

## Stack

- **Backend** (`backend/`): NestJS 11 + TypeORM, SQLite (better-sqlite3). The API is
  mounted at `/api/`.
- **Frontend** (`frontend/`): Vite + React 18 + TypeScript + Tailwind v4 +
  `@kleros/ui-components-library`. React must stay on 18 (library peer dependency).
- **Root tooling** (`package.json` at the repo root): husky, lint-staged, commitlint, ESLint and
  Prettier only. It is not a workspace root; the three packages keep their own lockfiles.
- **Package manager**: Yarn 4 with `nodeLinker: node-modules`. Node and Yarn are pinned
  with Volta in each `package.json`. Do not use npm or pnpm in `backend/`, `frontend/`
  `contract-tests/` or `e2e/`.
- **Contract suite** (`contract-tests/`): Jest + TypeScript, black-box HTTP tests that
  boot `backend/` on a temp SQLite DB.
- **Browser e2e** (`e2e/`): Playwright (Chromium), drives the real frontend (Vite) against the
  real backend on a temp SQLite DB.

## Commands

Always use the root `Makefile` targets, run from the repository root:

| Command              | What it does                                                         |
| -------------------- | -------------------------------------------------------------------- |
| `make setup`         | Runs `yarn install` in the root (installs git hooks), `backend/`, `frontend/`, `contract-tests/` and `e2e/`; installs Playwright Chromium |
| `make lint`          | Prettier check, ESLint (backend, contract-tests, e2e) and oxlint (frontend), zero warnings |
| `make migrate`       | Builds the backend and applies TypeORM migrations to SQLite          |
| `make seed`          | Builds the backend and runs the idempotent seed (9 users)            |
| `make dev-backend`   | Starts Nest in watch mode on http://localhost:8000                   |
| `make dev-frontend`  | Starts Vite on http://localhost:5173                                 |
| `make test`          | Runs backend (Jest), frontend (vitest), the contract suite, then browser e2e |
| `make test-contract` | Runs only the contract suite                                         |
| `make test-e2e`      | Runs only the browser e2e suite (Playwright)                         |

First run: `make setup`, then `make migrate`, then `make seed`.

- `dev-backend` and `dev-frontend` are long-running servers: start them in the
  background and stop them when done.
- The frontend proxies `/api` to the backend, so call the API with relative
  `/api/...` paths from the UI.
- API docs: http://localhost:8000/api/docs.
- Generate a migration after changing entities with
  `cd backend && yarn migration:generate src/migrations/<Name>`.

## Environment

The backend reads `backend/.env` (see `backend/.env.example`). `SECRET_KEY` is
required; the backend will not start without it. Optional: `DB_PATH` (defaults to
`backend/db.sqlite3`), `DEBUG`, `PORT` (defaults to 8000). Never commit `.env`, and do not read or
write it: ask the user to create or change it.

## Lint and hooks

- `make setup` installs the git hooks (husky). `pre-commit` runs `lint-staged` (Prettier check plus ESLint
  with `--max-warnings 0` for backend, contract-tests and e2e, oxlint with `--deny-warnings` for frontend).
  `commit-msg` enforces Conventional Commits with commitlint.
- Format with `yarn prettier --write <paths>` from the root; `yarn eslint --fix backend contract-tests e2e` fixes
  what it can.
- Do not bypass hooks with `--no-verify`, and do not add `eslint-disable` without a one-line justification.
- `make lint` must pass, with zero warnings, before a task is considered done.

## Tests

- Backend tests live in `backend/test/` (Jest, `*.spec.ts`); they set their own dummy
  `SECRET_KEY` and use a temp DB.
- The contract suite lives in `contract-tests/`; it is the source of truth for the HTTP
  contract the frontend relies on.
- Frontend tests live next to the source as `*.test.ts(x)` (vitest). They mock the API, so they cannot catch
  frontend/backend shape drift.
- Browser e2e specs live in `e2e/tests/` (`*.spec.ts`). Add one for every user-visible flow that crosses the
  API, so the real frontend is checked against the real backend.
- `make test` must pass before a task is considered done.
