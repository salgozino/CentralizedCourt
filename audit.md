# Authorization Security Audit

Audit of CentralizedCourt against section "1. Where privilege-escalation flaws usually live" of
[`cookies-good-practices.md`](cookies-good-practices.md).

- Date: 2026-10-08
- Branch audited: `feat/draw-vote`
- Method: one auditor per item, then one adversarial verifier per item that tried to refute every
  finding and look for missed ones. No finding was refuted; some severities were adjusted (final
  severities shown). Findings 1.1, 4.1 and 5.1 were also spot-checked by hand.
- Status: findings open, to be fixed in a later session.

## Summary

| #   | Item                                         | Status              |
| --- | -------------------------------------------- | ------------------- |
| 1   | Allow-by-default guards                      | Partially compliant |
| 2   | Guard ordering and trusted user data         | Compliant           |
| 3   | UI-only authorization (BFLA)                 | Compliant           |
| 4   | IDOR/BOLA and property-level authorization   | Partially compliant |
| 5   | Session fixation, stale roles and cookies    | Partially compliant |

### Priorities

1. **4.1** Case creator can seat themselves as a juror (real business-rule bug).
2. **1.1 + 1.2** Deny-by-default global guard plus a route-inventory test (prevents regressions).
3. **5.1 + 5.2** `Secure` / `__Host-` cookies and a session-bound CSRF token.

## What is done well

- No metadata-driven `RolesGuard` with `return true`; `AdminGuard`
  (`backend/src/admin/admin.guard.ts:8-11`) and `CreatorGuard` (`backend/src/cases/creator.guard.ts:8-11`)
  always check and throw `ForbiddenException`.
- `SessionAuthGuard` re-reads the user from the DB on every request and rejects inactive users
  (`backend/src/auth/session-auth.guard.ts:9-21`, `backend/src/session/session.service.ts:40-44`). The
  session stores only `userId`, so role changes and deactivation apply immediately (no stale roles).
- Fresh session key at login (`cycleKey`, or `flush` when the session belonged to another user) and
  only server-generated session ids are accepted (`backend/src/session/session.service.ts:47-53,
105-116`). No session fixation.
- Case list and detail are scoped by `creatorId` unless the user is admin
  (`backend/src/cases/cases.controller.ts:36-50`).
- Every action hidden in the UI has a server-side 403 with tests (`contract-tests/tests/admin.contract.test.ts`,
  `backend/test/admin.spec.ts`, `backend/test/cases.spec.ts`, `backend/test/draw.spec.ts`).
- Guard order (401 > CSRF 403 > role 403 > 422 > 404) is documented and asserted in contract tests
  (`contract-tests/tests/admin.contract.test.ts:125`).

## 1. Allow-by-default guards — Partially compliant

No route is unintentionally open today, but protection is opt-in per controller.

### 1.1 No global deny-by-default guard or `@Public()` opt-out — medium

- **Evidence:** `backend/src/app.module.ts:11-26` registers no `APP_GUARD`;
  `backend/src/app.ts:42-46` has no `useGlobalGuards`. No `@Public` / `IS_PUBLIC` anywhere. Each
  controller opts in (`admin.controller.ts:33`, `cases.controller.ts:27`, `auth.controller.ts:65`).
  `AuthController` uses an empty `@Controller()` (`auth.controller.ts:17`) and mixes public and
  protected routes, so any new handler there is public by default.
- **Fix:** register `SessionAuthGuard` and `CsrfGuard` as global `APP_GUARD`s; add a `@Public()`
  decorator read via `reflector.getAllAndOverride([handler, class])`; mark only
  `auth/request-code`, `auth/verify` and `auth/logout` as public. Keep `AdminGuard` / `CreatorGuard`
  per route.

### 1.2 No route-inventory test — low

- **Evidence:** 401 tests are written per known route (`backend/test/cases-read.spec.ts:35-36`,
  `backend/test/cases.spec.ts:72`, `backend/test/draw.spec.ts:55`, `backend/test/http.spec.ts:245`,
  `contract-tests/tests/admin.contract.test.ts:98,126,172-178`). A new unguarded route passes CI.
- **Fix:** a spec that enumerates every registered route and asserts anonymous 401 except an explicit
  public allowlist.

### 1.3 `CsrfGuard` passes when `req.user` is missing — low

- **Evidence:** `backend/src/auth/csrf.guard.ts:18`
  (`if (SAFE_METHODS.has(req.method) || !req.user) return true`). Safe only when ordered after
  `SessionAuthGuard` (`csrf.guard.ts:10-13`).
- **Fix:** with a global guard, enforce CSRF on every unsafe method of non-public routes regardless
  of `req.user`, or fail closed.

### 1.4 Login and logout have no CSRF / Origin check — low

- **Evidence:** `backend/src/auth/auth.controller.ts:24-62` has no CSRF guard or Origin check on
  `request-code`, `verify` and `logout`. Enables login CSRF (victim logged into the attacker's
  account) and forced logout.
- **Fix:** validate `Origin` / `Sec-Fetch-Site` on these public unsafe endpoints; apply CSRF to
  logout when a session exists.

### 1.5 `AdminGuard` / `CreatorGuard` assume `req.user` exists — info

- **Evidence:** `backend/src/admin/admin.guard.ts:9-10`, `backend/src/cases/creator.guard.ts:9-10`
  read `user.isAdmin` / `user.isCreator` without a null check; misordered, they fail with 500.
- **Fix:** `if (!user) throw new UnauthorizedException()` at the top of each guard.

## 2. Guard ordering and trusted user data — Compliant

`request.user` is always loaded from the DB by `SessionAuthGuard` from a server-generated session;
roles never come from client-controlled data.

### 2.1 Draw authorization relies on ownership only — low

- **Evidence:** `backend/src/cases/cases.controller.ts:68-75` checks
  `row.creatorId !== req.user.id && !req.user.isAdmin`, with no `CreatorGuard`. A creator whose
  creator role was revoked keeps draw rights on their own cases.
- **Fix:** decide the business rule; if revoked creators must lose draw rights, also require
  `isCreator`.

### 2.2 Sessions survive deactivation — info

- **Evidence:** deactivation only makes `currentUser` return null
  (`backend/src/session/session.service.ts:43`); session rows remain for up to 14 days
  (`backend/src/session/session-handle.ts:4`) and become valid again if the user is reactivated.
- **Fix:** delete all sessions of a user on deactivation (see 5.3).

## 3. UI-only authorization (BFLA) — Compliant

Every UI-gated action is enforced server-side with tests. The juror "My assignments" section
(`frontend/src/components/HomePage.tsx:23-29`) is still a placeholder with no API call.

### 3.1 Draw check is inline instead of a reusable guard/policy — info

- **Evidence:** `backend/src/cases/cases.controller.ts:69-77` checks ownership inline and parses the
  body manually with `new ZodBodyPipe(DrawIn)`. Correct and tested, but every future object-scoped
  endpoint must repeat the pattern.
- **Fix:** extract a case-ownership guard or policy before adding more object-scoped endpoints.

## 4. IDOR/BOLA and property-level authorization — Partially compliant

### 4.1 Case creator can seat themselves as a juror — medium

- **Evidence:** `backend/src/cases/jury.service.ts:18`
  (`const isEligible = (u: User) => u.isJuror && !u.isAdmin && u.isActive;`) never compares against
  the case `creatorId`. Manual assignment (`jury.service.ts:65-74`) accepts any eligible id from the
  client-supplied `jurorIds`, and the random draw can also pick the creator.
- **Fix:** exclude the case creator from eligibility in both random draw and manual assignment; add
  red tests first.

### 4.2 Draw endpoint is a case-existence oracle (404 vs 403) — low

- **Evidence:** `backend/src/cases/cases.controller.ts:71-75` returns 404 for a missing case and 403
  for another creator's case, while `GET /cases/:id` (`cases.controller.ts:44-49`) returns 404 for
  both. Any authenticated user can enumerate case ids.
- **Fix:** scope the draw lookup by `creatorId` (unless admin) and return 404 for both.

### 4.3 Draw response exposes juror emails to the case creator — low

- **Evidence:** `backend/src/cases/dto.ts:80-85` (`toJurorOut` returns `email`), returned to the
  creator in `cases.controller.ts:79`. The creator learns the identity of the jurors judging their
  case.
- **Fix:** decide the product rule; if jurors should be anonymous to creators, return only an opaque
  id or display label.

### 4.4 Non-strict Zod schemas silently drop unknown fields — info

- **Evidence:** `backend/src/admin/admin.controller.ts:15`, `backend/src/auth/dto.ts:5-6` use
  `z.object(...)`. Extra fields such as `isAdmin` are dropped, not rejected. Not exploitable today
  because handlers read only validated fields.
- **Fix:** use `.strict()` so mass-assignment attempts fail loudly with 422.

### 4.5 Stale comment about juror-assignment visibility — info

- **Evidence:** `backend/src/cases/cases.controller.ts:34` says assignment visibility will come in
  slice 3; the `CaseJuror` entity exists but list/detail do not consider it yet.
- **Fix:** implement juror-scoped visibility with object-level checks when the juror flow lands.

### 4.6 Inconsistent id parsing between admin and cases routes — info

- **Evidence:** `backend/src/admin/admin.controller.ts:18-29` accepts signed ids and returns 422;
  `backend/src/cases/cases.controller.ts:83-87` accepts only positive digits and returns 404. Not
  exploitable.
- **Fix:** share one id-parsing pipe.

## 5. Session fixation, stale roles and cookies — Partially compliant

### 5.1 Session cookie lacks `Secure` and the `__Host-` prefix — medium

- **Evidence:** `backend/src/http/cookies.ts:25-30` emits only `HttpOnly`, `Max-Age`, `Path=/`,
  `SameSite=Lax`; `CookieOptions` (`cookies.ts:3-6`) has no `secure` field. The cookie is named
  `sessionid`. Sibling subdomains can set or overwrite it (cookie tossing) and it can travel over HTTP.
- **Fix:** add `Secure` and rename to `__Host-sessionid` (and `__Host-csrftoken`) in production; keep
  a dev override for plain-HTTP localhost.

### 5.2 CSRF token not bound to the session — low

- **Evidence:** `backend/src/auth/csrf.guard.ts:20-22` only checks header == cookie (plain double
  submit). `backend/src/auth/csrf.ts:9` gives the token a one-year lifetime and
  `backend/src/auth/auth.controller.ts:66-68` (`GET /me`) reuses any well-formed existing token.
  Combined with 5.1, an attacker controlling a sibling subdomain can toss a known `csrftoken`.
- **Fix:** HMAC-sign the CSRF token with `SECRET_KEY` bound to the session id, and rotate it on login.

### 5.3 No session revocation on deactivation or privilege change — low

- **Evidence:** role changes (`backend/src/admin/admin.controller.ts:42-55`) and deactivation never
  touch the `sessions` table. No "log out everywhere"; logout only flushes the current session
  (`auth.controller.ts:57-61`).
- **Fix:** a `SessionService` method that deletes all sessions for a `userId`, called on deactivation
  (and optionally on role changes), plus a "log out everywhere" endpoint.

### 5.4 Logout leaves the `csrftoken` cookie in place — low

- **Evidence:** `backend/src/auth/auth.controller.ts:57-62` flushes the session but neither rotates
  nor deletes `csrftoken`.
- **Fix:** delete or rotate the CSRF cookie on logout.

### 5.5 No idle timeout or absolute lifetime; expired rows only deleted on use — low

- **Evidence:** `backend/src/session/session-handle.ts:4` sets 14 days; `session.service.ts:61` only
  commits modified sessions; expired rows are removed only when presented
  (`session.service.ts:111-114`), with no scheduled cleanup.
- **Fix:** add an idle timeout and an absolute lifetime, and a periodic cleanup of expired rows.
