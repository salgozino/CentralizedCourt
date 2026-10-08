# Cookie Auth Security Good Practices (NestJS + React)

Research on privilege-escalation risks, audit methodology, and cookie/CORS/CSRF configuration for a
NestJS backend and React frontend using cookie-based authentication.

Research date: 2026-10-08. 21 sources fetched, 25 claims verified (24 confirmed, 1 refuted).

## Summary

Privilege escalation in cookie-auth NestJS/React apps usually comes from architecture, not crypto:
allow-by-default guards, guard ordering, UI-only checks, and missing object-level (IDOR/BOLA) checks.
Audit with a machine-readable authorization matrix that generates per-role tests, enforced as a
required CI check, complemented by manual Burp testing and the ASVS 5.0 V8/V3 checklists.

- `example.com` + `api.example.com` is **cross-origin but same-site**: SameSite does not protect
  against a compromised sibling subdomain.
- `example.com` + `example.com/api` is **same-origin**: simplest and safest, but still keep a primary
  CSRF defense.

## 1. Where privilege-escalation flaws usually live

### Allow-by-default guards

The `RolesGuard` from the official NestJS docs returns `true` when a route has no `@Roles` metadata
(`if (!requiredRoles) return true`), and grants access if the user has ANY of the listed roles.
Forgetting the decorator leaves the route open.

**Fix:** a global `APP_GUARD` that denies by default, with an explicit `@Public()` opt-out.

Sources: [NestJS Authorization](https://docs.nestjs.com/security/authorization),
[NestJS v9 Authorization](https://docs.nestjs.com/v9/security/authorization). Confidence: high.

### Guard ordering and trusted user data

Authorization assumes `request.user` was already populated by an authentication guard from
server-verified data. Global guards run in module-scan order; a wrong order makes the authz guard run
before `request.user` exists. Roles derived from client-controlled data (unsigned cookie, request
body) can be bypassed (inference, not stated by the docs).

Sources: [NestJS Authorization](https://docs.nestjs.com/security/authorization). Confidence: high.

### UI-only authorization (BFLA)

Hiding buttons or routes in React is not a control. Every function-level check must be enforced in
the API.

Source: [OWASP Authorization Regression Testing](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Regression_Testing_Cheat_Sheet.html).
Confidence: high.

### IDOR/BOLA and property-level authorization (BOPLA / mass assignment)

ASVS 5.0 chapter V8 (Authorization; it was "V4 Access Control" in 4.0):

- V8.2.2 (L1): data-specific (object-level) access checks.
- V8.2.3 (L2): field/property-level authorization, which covers mass assignment.

Source: [OWASP ASVS index](https://cheatsheetseries.owasp.org/IndexASVS.html). Confidence: high.

### Session fixation and stale roles

Regenerate the session ID after login and after every privilege change (role grant, admin
elevation). Accept only server-generated session IDs. With stateless JWT cookies, re-issue the token
on those events; stale role claims remain valid until the old token expires.

Source: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
Confidence: high.

## 2. How to audit

1. **Authorization matrix**: one central, machine-readable file (JSON/YAML, not a spreadsheet) with
   actor/role × resource × action, plus a data dimension when needed.
2. **Generated tests**: one test suite per role (point of view) that calls every endpoint and
   compares against the matrix. Both unexpected access and unexpected denial are failures.
3. **Required CI check**: run the authz suite on every release; a failing authz test blocks the PR
   merge. Authz bugs appear as features change.
4. **Manual / semi-automated tooling**:
   - **Burp Autorize** (updated Feb 2026): replays high-privilege traffic with a low-privilege or
     anonymous cookie and flags Bypassed / Enforced / uncertain. Use a peer user's cookie to find
     horizontal escalation (IDOR). Caveat: state-changing requests need the low-privilege user's CSRF
     token, otherwise CSRF rejections look like "enforced".
   - **Burp AuthMatrix**: runs every role × request combination from a predefined matrix. Last
     updated Oct 2021.
   - Both produce candidates that still need human confirmation.
5. **Checklist map (ASVS 5.0)**:
   - V3.3 Cookie Setup → CSRF, Session Management, TLS cheat sheets.
   - V3.5 Browser Origin Separation → CSRF, HTML5 Security, Micro Frontend cheat sheets.
   - V8.2 General Authorization Design → Authorization, IDOR Prevention cheat sheets.

Sources: [OWASP Authorization Testing Automation](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Testing_Automation_Cheat_Sheet.html),
[OWASP Authorization Regression Testing](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Regression_Testing_Cheat_Sheet.html),
[Burp Autorize](https://portswigger.net/bappstore/f9bbac8c4acf4aefa4d7dc92a991af2f),
[Burp AuthMatrix](https://portswigger.net/bappstore/30d8ee9f40c041b0bfec67441aad158e),
[OWASP ASVS index](https://cheatsheetseries.owasp.org/IndexASVS.html). Confidence: high.

## 3. CSRF and cookie fundamentals

- **SameSite is defense in depth**, not the primary CSRF defense. Primary options:
  - synchronizer token, or signed double-submit token;
  - Fetch Metadata (`Sec-Fetch-Site`) with an `Origin` check as fallback;
  - non-simple requests (JSON content type or a custom header).
- Prefer `SameSite=Strict`; use `Lax` only if needed. `Lax` still sends cookies on top-level GET
  navigations, so state-changing GET endpoints and method-override tricks bypass it.
- **Naive double-submit is breakable** via cookie injection from a sibling subdomain, DNS takeover,
  or plain HTTP. CSRF tokens must be HMAC-signed with a server secret **and bound to the session**;
  signing without session binding gives minimal protection.
- **`__Host-` prefix** for the session cookie (and the CSRF cookie): requires `Secure`, `Path=/` and
  no `Domain`, making the cookie host-only. Sibling subdomains cannot set or overwrite it (blocks
  cookie tossing and HTTPS downgrade attacks). Use `__Secure-` only when subdomain sharing is truly
  required.

Sources: [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
[MDN CSRF](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF),
[PortSwigger SameSite bypass](https://portswigger.net/web-security/csrf/bypassing-samesite-restrictions),
[OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
Confidence: high.

## 4. Deployment A: frontend `example.com`, API `api.example.com`

These are **cross-origin but same-site** (same eTLD+1, both HTTPS). SameSite cookies are sent between
any `*.example.com` hosts, so an XSS or takeover on any sibling subdomain defeats SameSite-based CSRF
protection. Relying on SameSite means trusting every subdomain.

Recommended configuration (synthesis, confidence: medium):

- **Cookie** set by the API:
  `__Host-session=...; HttpOnly; Secure; Path=/; SameSite=Strict` (or `Lax`), **no `Domain`**.
  Never use `Domain=.example.com`.
- **CORS**: explicit origin allowlist (`https://example.com`) with `credentials: true`. Never reflect
  the request `Origin`, never allow `null`, never combine a wildcard with credentials.
- **Frontend**: `fetch(url, { credentials: 'include' })`.
- **CSRF**: session-bound HMAC token sent in a custom header, plus a server-side `Origin` and
  `Sec-Fetch-Site` check.
- **Audit every `*.example.com` host**: any of them can break the model.

## 5. Deployment B: frontend `example.com`, API `example.com/api` (reverse proxy)

Same-origin: the simplest and safest layout.

Recommended configuration (synthesis, confidence: medium):

- **No CORS** needed.
- **Cookie**: `__Host-session=...; HttpOnly; Secure; Path=/; SameSite=Strict`.
- **No state-changing GET endpoints** and no method override.
- **Keep a primary CSRF defense** (session-bound token, or Fetch Metadata plus `Origin` check).
  Dropping it is defensible only under OWASP's narrow exception where every condition holds. This
  conclusion is supported by the OWASP CSRF cheat sheet and MDN (not by the Session Management cheat
  sheet; that attribution was refuted 0-3).

## Caveats and gaps

- **Not verified in this run** (general knowledge only):
  - CORS misconfigurations (reflected `Origin`, `null` origin, wildcard with credentials);
  - NestJS mass assignment via `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`;
  - JWT role-claim tampering and stale roles;
  - the OWASP API Top 10 on its own.
- Several findings rest on a single OWASP cheat sheet; "should/must" there is best-practice guidance,
  not a formal ASVS requirement.
- Schemeful same-site and the Public Suffix List affect what counts as "same-site".
- Time sensitivity: ASVS 5.0.x (May 2025) is current; browser SameSite defaults may keep changing.

## Open questions

- How to implement deny-by-default authorization in NestJS (global `APP_GUARD` + `@Public()`, or CASL
  policies) and verify it statically (lint or startup check that every route has authz metadata)?
- Which maintained NestJS CSRF library (e.g. `csrf-csrf`, signed double-submit) binds the token to
  the session properly now that `csurf` is deprecated, and how to combine it with Fetch Metadata
  middleware?
- What exact NestJS `enableCors` configuration is safe for credentialed requests from `example.com`
  to `api.example.com` (allowlist, credentials, preflight caching)?
- How to encode object-level (BOLA) and property-level (BOPLA) checks in the authorization matrix and
  generated tests, beyond role-level checks?

## Sources

- [NestJS Authorization](https://docs.nestjs.com/security/authorization)
- [NestJS v9 Authorization](https://docs.nestjs.com/v9/security/authorization)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Authorization Testing Automation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Testing_Automation_Cheat_Sheet.html)
- [OWASP Authorization Regression Testing Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Regression_Testing_Cheat_Sheet.html)
- [OWASP ASVS Index](https://cheatsheetseries.owasp.org/IndexASVS.html)
- [MDN: CSRF](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF)
- [PortSwigger: Bypassing SameSite restrictions](https://portswigger.net/web-security/csrf/bypassing-samesite-restrictions)
- [Burp Autorize](https://portswigger.net/bappstore/f9bbac8c4acf4aefa4d7dc92a991af2f)
- [Burp AuthMatrix](https://portswigger.net/bappstore/30d8ee9f40c041b0bfec67441aad158e)
