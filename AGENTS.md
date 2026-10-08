# AGENTS.md

Instructions for coding agents working on CentralizedCourt. Read `EXPERIMENT.md` for
the product scope, `ACCEPTANCE.md` for the acceptance criteria and `NEXT_STEPS.md` for
the current state.

## Development Flow

In this project we always follow strict TDD. That means that first you need to do a commit with the red tests and later a second (or more) commits with the green cases.

## Stack

- **Backend** (`backend/`): NestJS 11 + TypeORM, SQLite (better-sqlite3). The API is
  mounted at `/api/`.
- **Frontend** (`frontend/`): Vite + React 18 + TypeScript + Tailwind v4 +
  `@kleros/ui-components-library`. React must stay on 18 (library peer dependency).
- **Root tooling** (`package.json` at the repo root): husky, lint-staged, commitlint, ESLint and
  Prettier only. It is not a workspace root; the three packages keep their own lockfiles.
- **Package manager**: Yarn 4 with `nodeLinker: node-modules`. Node and Yarn are pinned
  with Volta in each `package.json`. Do not use npm or pnpm in `backend/`, `frontend/`
  or `contract-tests/`.
- **Contract suite** (`contract-tests/`): Jest + TypeScript, black-box HTTP tests that
  boot `backend/` on a temp SQLite DB.

## Commands

Always use the root `Makefile` targets, run from the repository root:

| Command              | What it does                                                         |
| -------------------- | -------------------------------------------------------------------- |
| `make setup`         | Runs `yarn install` in the root (installs git hooks), `backend/`, `frontend/` and `contract-tests/` |
| `make lint`          | Prettier check, ESLint (backend, contract-tests) and oxlint (frontend), zero warnings |
| `make migrate`       | Builds the backend and applies TypeORM migrations to SQLite          |
| `make seed`          | Builds the backend and runs the idempotent seed (9 users)            |
| `make dev-backend`   | Starts Nest in watch mode on http://localhost:8000                   |
| `make dev-frontend`  | Starts Vite on http://localhost:5173                                 |
| `make test`          | Runs backend (Jest), frontend (vitest), then the contract suite      |
| `make test-contract` | Runs only the contract suite                                         |

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
  with `--max-warnings 0` for backend and contract-tests, oxlint with `--deny-warnings` for frontend).
  `commit-msg` enforces Conventional Commits with commitlint.
- Format with `yarn prettier --write <paths>` from the root; `yarn eslint --fix backend contract-tests` fixes
  what it can.
- Do not bypass hooks with `--no-verify`, and do not add `eslint-disable` without a one-line justification.
- `make lint` must pass, with zero warnings, before a task is considered done.

## Tests

- Backend tests live in `backend/test/` (Jest, `*.spec.ts`); they set their own dummy
  `SECRET_KEY` and use a temp DB.
- The contract suite lives in `contract-tests/`; it is the source of truth for the HTTP
  contract the frontend relies on.
- Frontend tests live next to the source as `*.test.ts(x)` (vitest).
- `make test` must pass before a task is considered done.
