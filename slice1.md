# Slice 1: Login + roles

End-to-end slice (backend + UI). See `EXPERIMENT.md` for the product and `AGENTS.md`
for commands. Cases, juror draws and voting are out of scope for this slice.

## Roles

- Every user has the base role `user`. A plain `user` has no permissions beyond
  logging in and seeing their own profile.
- Extra roles: `creator`, `juror`, `admin`. A user can hold several roles at once
  (e.g. `creator` + `juror`).
- Only an `admin` can assign or remove `creator` and `juror` roles. The `admin` role
  is only granted by the seed in this slice (not assignable through the API).
- There is no signup. Only users that already exist in the database can log in.

## Seed

`cd backend && .venv/bin/python manage.py seed` creates these users. It must be
idempotent (running it twice does not duplicate users or change roles).

| Email                  | Roles               |
| ---------------------- | ------------------- |
| `admin@example.com`    | `user`, `admin`     |
| `creator1@example.com` | `user`, `creator`   |
| `creator2@example.com` | `user`, `creator`   |
| `juror1@example.com`   | `user`, `juror`     |
| `juror2@example.com`   | `user`, `juror`     |
| `juror3@example.com`   | `user`, `juror`     |
| `juror4@example.com`   | `user`, `juror`     |
| `juror5@example.com`   | `user`, `juror`     |
| `user@example.com`     | `user`              |

## Login flow

Passwordless, email + one-time code, no external services.

1. The user submits their email. If the user exists, a 6-digit code is generated,
   stored in the database and printed to the backend console (stdout or stderr) as
   a single line: `LOGIN CODE <email> <code>`.
2. The user submits email + code. On success a Django session is created (session
   cookie).
3. A code is single-use and expires after 10 minutes. A code is only valid for the
   email it was issued to.
4. Each issuance creates a separate challenge bound to an opaque HttpOnly cookie.
   Verification requires that cookie and allows five attempts per challenge,
   persisted atomically across workers. No account-wide lockout: an attacker's
   requests cannot spend another browser's budget or invalidate its code.
5. Issuance is bounded to 20 requests per peer IP and 200 globally per ten-minute
   window, independent of email. Unknown/throttled requests receive the same `200`
   response and cookie shape, but no code. Existing challenges remain verifiable
   when issuance is throttled. See README for shared-IP/proxy limitations.

## API contract

All endpoints under `/api/`. Authentication is the Django session cookie.
Login clients must also retain the `login_challenge` cookie from request-code
through verify; payload shapes are unchanged. Exhausted/unbound challenges return
`401`, identical to invalid codes.

| Method | Path                         | Body                    | Success                                       | Errors                                                     |
| ------ | ---------------------------- | ----------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| POST   | `/api/auth/request-code`     | `{"email": str}`        | `200` always (unknown emails get no code; the response does not reveal whether the email exists) | `422` invalid body |
| POST   | `/api/auth/verify`           | `{"email": str, "code": str}` | `200` + session cookie, body same as `/api/me` | `401` wrong, expired, used or foreign code; unknown email |
| POST   | `/api/auth/logout`           | —                       | `200`, session cleared                        | —                                                          |
| GET    | `/api/me`                    | —                       | `200` `{"id": int, "email": str, "roles": [str]}` | `401` not logged in                                    |
| GET    | `/api/admin/users`           | —                       | `200` `[{"id": int, "email": str, "roles": [str]}]` | `401` not logged in, `403` not admin                 |
| PUT    | `/api/admin/users/{id}/roles`| `{"roles": [str]}`      | `200` updated user (same shape as list item)   | `401`, `403` not admin, `404` unknown user, `422` invalid role or tries to set/remove `admin` |

- `roles` is always a sorted list and always includes `user`.
- In `PUT .../roles`, the body lists the extra roles to hold (subset of
  `["creator", "juror"]`); `user` is implied and `admin` is left unchanged.
- Permission checks are enforced in the backend, not only hidden in the UI.

## UI

- Login screen: enter email, then enter the code from the console.
- After login, a home screen that shows the user's email and roles, with one
  section per role held:
  - `admin`: list of users with controls to assign/remove `creator` and `juror`.
  - `creator`: placeholder "Cases" section (cases come in slice 2).
  - `juror`: placeholder "My assignments" section (slice 3).
  - Only `user`: a clear message that they have no permissions yet and must ask
    an admin.
- Logout button.

## Acceptance

- [x] Each seeded user logs in with the console-printed code and sees the sections
      matching their roles.
- [x] Wrong, reused, expired or foreign codes are rejected; unknown emails cannot log in.
- [x] A non-admin calling the admin endpoints gets `403`.
- [x] The admin gives `user@example.com` the `creator` and `juror` roles; after
      that `/api/me` for that user returns `["creator", "juror", "user"]` and the UI
      shows both sections.
- [x] Custom `AUTH_USER_MODEL` defined before the first migration.
- [x] Backend tests cover the contract above; `make test` passes.
- [ ] Your work will also be checked by additional tests against this contract.

### Evidence (2026-10-02)

- `make test`: contract/security coverage in `backend/tests/test_accounts.py`;
  UI interaction/role coverage in `frontend/src/App.test.tsx` and CSRF client
  coverage in `frontend/src/api.test.ts`.
- `make e2e`: `frontend/e2e/slice1.mjs` logs in all nine users using actual console
  codes, checks role sections, session persistence and logout, and grants/removes
  both roles across two independent browser sessions against a real Django server.
- `backend/accounts/migrations/0001_initial.py`: custom user created from the first
  accounts migration; fresh database migration verified.
- `make build` and `make lint` pass. External/additional tests remain pending.
