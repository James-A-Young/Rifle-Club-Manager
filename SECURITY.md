# Security Policy

## Supported Versions

| Version  | Supported |
|----------|-----------|
| `main`   | ✅ Yes    |
| Older    | ❌ No     |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email the maintainer directly or use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) feature.

We aim to acknowledge reports within **48 hours** and to issue a fix within **14 days** for critical issues.

---

## Threat Model

### Assets

| Asset | Sensitivity | Notes |
|---|---|---|
| User PII (name, DOB, address, place of birth) | High | UK GDPR Article 9 adjacent |
| Firearm & certificate data | High | Regulated information under UK Firearms Act 1968 |
| Visit logs | Medium | Operational records |
| Club sign-in links & kiosk tokens | Medium | High-entropy secrets; compromise enables guest sign-in |
| Auth JWTs | High | Full account takeover if stolen |
| Google Wallet private key | Critical | Signs membership pass JWTs sent to walletobjects.googleapis.com |

### Trust Boundaries

```
[Public internet]
      │
      ▼
[Reverse proxy / load-balancer]  ← TLS termination here
      │
      ▼
[Express API server]  ← validates JWT / cookie on every protected request
      │
      ▼
[PostgreSQL via Prisma]  ← parameterised queries only; no raw SQL from user input
```

### Actors

| Actor | Trust level |
|---|---|
| Anonymous visitor | Untrusted — can only use public sign-in link or kiosk URL |
| Authenticated member | Low trust — access to own data and clubs they belong to |
| Club admin | Medium trust — can manage their own club's data |
| System admin (OWNER role) | High trust |
| CI/CD pipeline | Trusted — but constrained by pinned action SHAs |

---

## Security Controls

### 1. Authentication

| Control | Implementation |
|---|---|
| Password hashing | `bcryptjs` with cost factor 10 |
| JWT signing | RS256 via `jsonwebtoken` with a minimum 32-character secret |
| JWT transport | **HttpOnly, Secure, SameSite=Lax cookie** (primary) + `Authorization: Bearer` header (backward-compat for API clients) |
| JWT expiry | 24 h for user auth; 20 min for sign-in-link access tokens |
| Secret validation | Server refuses to start if `JWT_SECRET` is absent or shorter than 32 characters (`server/src/config/jwt.ts`) |
| Rate limiting | 15 req/15 min on `/api/auth/*`; 300 req/15 min global |

### 2. Authorisation

| Control | Implementation |
|---|---|
| Route protection | `requireAuth` middleware on all non-public routes |
| Club admin checks | `ensureAdminForClub()` helper called before any admin action |
| Firearm IDOR prevention | `DELETE /api/clubs/:id/firearms/:firearmId` verifies `{ id, clubId, ownerType: CLUB }` before deleting |
| Firearm visit-link scope | Serial-number auto-link and explicit `firearmUsedId` are both checked against `{ clubId }` OR `{ userId }` — never the whole database |
| Kiosk endpoints | Public, protected by high-entropy `cryptoToken` in the URL. Sign-out uses `publicVisitRef` (also high-entropy). Operators must keep kiosk URLs confidential. |

### 3. Injection Prevention

| Control | Implementation |
|---|---|
| SQL injection | All DB access via Prisma with parameterised queries; no `$queryRawUnsafe` with user input |
| Input validation | All request bodies validated with Zod schemas before use |
| Prototype pollution | No `JSON.parse` of untrusted data merged into plain objects; no `eval`, `new Function`, or `child_process` |

### 4. Security Headers

Provided by `helmet` (default config):

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 0` (CSP preferred)
- `Strict-Transport-Security` (in production)
- `Content-Security-Policy` (helmet defaults)

### 5. Error Handling

Internal error details (`error.message`, stack traces, Prisma codes) are **never** returned in HTTP responses. All `console.error` output is captured by the container log driver.

### 6. Security Audit Logging

Structured JSON security events are emitted to stdout by `server/src/middleware/auditLog.ts`:

| Event code | Trigger |
|---|---|
| `SECURITY_AUTH_LOGIN_FAILED` | Wrong password or unknown email |
| `SECURITY_AUTH_LOGIN_SUCCESS` | Successful login |
| `SECURITY_AUTH_REGISTER_SUCCESS` | New registration |
| `SECURITY_FIREARM_DELETE_DENIED` | IDOR attempt on firearm deletion |
| `SECURITY_FIREARM_LINK_DENIED` | Out-of-scope firearm supplied at sign-in |
| `SECURITY_MEMBER_STATUS_CHANGE` | Admin approves/rejects a member |
| `SECURITY_MEMBER_ROLE_CHANGE` | Admin promotes/demotes a member |
| `SECURITY_SIGNIN_LINK_INVALID` | Invalid or expired sign-in link accessed |
| `SECURITY_KIOSK_SIGNIN` | Any sign-in via kiosk or QR flow |

Each line includes `ts`, `severity`, `event`, `ip`, and relevant IDs. No passwords, tokens, or free-form PII are logged.

### 7. Supply-Chain Integrity

All GitHub Actions steps are pinned to **full commit SHAs** (not mutable version tags). See `.github/workflows/ci.yml` and `.github/workflows/docker-publish.yml`.

---

## Secure Deployment Checklist

### Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string — keep secret |
| `JWT_SECRET` | ✅ Yes | **Minimum 32 characters**. Generate: `openssl rand -base64 48` |
| `CLIENT_ORIGIN` | ✅ Yes | Exact origin of the React SPA (e.g. `https://app.example.com`) |
| `NODE_ENV` | ✅ Yes | Set to `production` in production |
| `PORT` | No | Defaults to `3000` |
| `GOOGLE_WALLET_ISSUER_ID` | Conditional | Required only if pass issuing is enabled |
| `GOOGLE_WALLET_ISSUER_EMAIL` | Conditional | Service account email |
| `GOOGLE_WALLET_PRIVATE_KEY` | Conditional | PEM-encoded RSA private key — treat as a secret |
| `GOOGLE_WALLET_PRIVATE_KEY_ID` | Conditional | Key ID from Google Cloud |
| `GOOGLE_WALLET_PROJECT_ID` | Conditional | GCP project ID |
| `GOOGLE_WALLET_CLIENT_ID` | Conditional | Service account client ID |

**Never commit secrets to the repository.** Use a secrets manager (AWS Secrets Manager, GCP Secret Manager, GitHub Actions Secrets, Docker secrets, etc.).

### docker-compose (local dev / staging)

The bundled `docker-compose.yml` contains placeholder values (`change-me-in-production` for `JWT_SECRET`, `shootingmatch` for the database password). **These must be replaced** before any internet-facing deployment.

### TLS

Always terminate TLS at the edge (reverse proxy, load balancer, or CDN). The Node.js server itself does not handle TLS.

With TLS in place the `auth_token` cookie's `Secure` flag (set automatically when `NODE_ENV=production`) prevents the cookie from being transmitted over plain HTTP.

### CORS

`CLIENT_ORIGIN` must be set to the exact origin of the React SPA. Wildcards are not supported.  `credentials: true` is required in the CORS config (already set) so the browser sends the HttpOnly cookie.

### Database

- The Prisma connection pool is the default (size 10). Adjust via `DATABASE_URL` connection pool parameters if needed.
- The database user should have only the minimum required privileges (no `SUPERUSER`, no `CREATEDB`).

---

## Kiosk & Sign-In Link Security Model

### How it works

1. An admin creates a kiosk link — a URL containing a high-entropy `cryptoToken` (96 bits of CSPRNG).
2. The kiosk device loads this URL. The server returns a short-lived access token (20 min) which is used for actual sign-in requests.
3. Sign-out operations use `publicVisitRef` — another high-entropy random value attached to each visit.

### Why these endpoints are public

The kiosk endpoints (`GET /api/visits/kiosk/:token/active`, `POST /api/visits/kiosk/:token/signout`, `POST /api/visits/public`) do not require authentication because kiosk devices are typically shared/unauthenticated machines. Security is provided by:

- **Secret URL** — the `cryptoToken` in the kiosk URL is generated by `crypto.randomBytes(12).toString('hex')` (96 bits). Guessing it is infeasible.
- **High-entropy sign-out refs** — `publicVisitRef` is similarly generated, so signing out a specific visitor requires knowledge of their individual ref.
- **Member card sign-in** — protected by club-level enable/disable switch (`memberCardSignInEnabled`) and QR data validation.

### Operator responsibility

- Kiosk URLs should be treated as passwords. Do not share them publicly or include them in URLs that appear in server logs.
- If a kiosk URL is compromised, revoke it from the admin dashboard and generate a new one.

---

## Incident Response

### Steps

1. **Contain** — revoke compromised JWT secrets (rotate `JWT_SECRET`; all existing tokens become invalid), revoke compromised kiosk links.
2. **Investigate** — search container logs for `SECURITY_AUTH_LOGIN_FAILED` spikes or `SECURITY_FIREARM_DELETE_DENIED` events that indicate active exploitation.
3. **Notify** — if personal data may have been accessed, initiate UK GDPR Article 33 breach notification (72-hour window to the ICO).
4. **Remediate** — patch the root cause and re-deploy.
5. **Review** — update this document and security tests.

### Key log queries (JSON log lines)

```bash
# Failed logins in the last hour
docker logs <container> | jq 'select(.event == "SECURITY_AUTH_LOGIN_FAILED")'

# IDOR attempts
docker logs <container> | jq 'select(.event | startswith("SECURITY_FIREARM"))'

# Privilege changes
docker logs <container> | jq 'select(.event | startswith("SECURITY_MEMBER"))'
```

---

## Dependencies

Production dependencies are pinned to minor version ranges. Run `npm audit` regularly. The CI pipeline runs `npm ci` (which installs exactly the versions in `package-lock.json`) so the lock file should be committed.

---

## Checklist for New Features

Before merging any feature that touches auth or data access, verify:

- [ ] Input validated with Zod before use
- [ ] Database queries scope data to the requesting user's club/id
- [ ] No raw `error.message` returned to clients
- [ ] Privileged actions emit an audit log event via `auditLog.ts`
- [ ] Integration test added for the happy path and at least one access-control failure path
- [ ] No new `any` types on untrusted input
