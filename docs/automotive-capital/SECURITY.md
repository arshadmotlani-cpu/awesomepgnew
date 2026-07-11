# Security — Automotive Capital

## 1. Threat Model

### 1.1 Assets to Protect

| Asset | Sensitivity |
|-------|-------------|
| Financial data (ledger, payments, capital) | **Critical** |
| Investment portfolio details | **Critical** |
| Uploaded documents (invoices, RC, bills) | **High** |
| Admin credentials | **Critical** |
| Session tokens | **High** |
| Business settings | **Medium** |

### 1.2 Threat Actors

| Actor | Likelihood | Impact |
|-------|------------|--------|
| Internet scanner / bot | High | Medium |
| Credential brute force | Medium | Critical |
| Session hijacking | Low | Critical |
| CSRF on financial actions | Low | High |
| SQL injection | Low | Critical |
| Unauthorized file access | Medium | High |
| PG/Capital cross-contamination | Low | High |

### 1.3 Assumptions

- Single trusted administrator (owner)
- Private software — not marketed publicly
- Accessed primarily from personal devices
- No third-party integrations in Phase 1

---

## 2. Authentication

### 2.1 Model

- **One administrator** — no registration, no password reset UI
- Credentials seeded from environment variables on first migration
- Password hashed with **scrypt** (reuse pattern from PG `src/lib/auth/crypto.ts`)
- Raw password never stored, never logged, never in source code

### 2.2 Environment Variables

```bash
INVEST_ADMIN_EMAIL=admin@example.com      # Seed only
INVEST_ADMIN_PASSWORD=<strong-password>   # Seed only — rotate after first login
INVEST_AUTH_SECRET=<32+ random bytes>       # Session signing
```

After seed, change password via Settings (Phase 2) or direct DB update. Env password used only when no admin exists.

### 2.3 Session Management

| Property | Value |
|----------|-------|
| Cookie name | `ac_session` |
| Storage | `ac_auth_sessions` table |
| Token | 32-byte random, SHA-256 hash stored |
| Transport | httpOnly cookie |
| Secure | `true` in production |
| SameSite | `Lax` |
| Path | `/` |
| TTL | 30 days (configurable via env) |
| Refresh | Sliding window on activity |

**Session validation flow:**

```
Request → read ac_session cookie → hash token → lookup ac_auth_sessions
  → check expires_at > now AND revoked_at IS NULL
  → load ac_admin_users → attach to request context
```

### 2.4 Login Protections

| Control | Implementation |
|---------|----------------|
| Rate limiting | 5 failed attempts / 15 min / IP |
| Constant-time compare | `safeEqual` for token/hash comparison |
| Failed login audit | `ac_activity_log` action `login_failed` |
| No user enumeration | Generic "Invalid credentials" message |
| No account lockout UI | Rate limit only (single user) |

---

## 3. Authorization

Phase 1: binary auth (logged in or not).

```typescript
async function requireCapitalAuth(): Promise<CapitalAdmin> {
  const session = await getCapitalSession();
  if (!session) throw new CapitalAuthError();
  return session.admin;
}
```

All Server Actions, API routes, and protected pages call this guard.

No role matrix. No PG `pgAccess` patterns.

---

## 4. Route Protection

### 4.1 Middleware (Edge)

- Host check: Capital middleware only on `invest.awesomepg.in`
- Cookie presence check for protected paths
- Redirect to `/login?next=` with safe next URL validation

### 4.2 Server-Side (Defense in Depth)

- Every Server Action: `requireCapitalAuth()`
- Every API route: session validation
- Every document proxy: ownership check via DB

### 4.3 PG Isolation

- Capital code cannot read `DATABASE_URL` tables
- PG middleware never processes Capital sessions
- Separate cookie names prevent session confusion

---

## 5. CSRF Protection

| Vector | Mitigation |
|--------|------------|
| Server Actions | Next.js built-in origin check |
| API routes | Same-origin + custom header `x-capital-request: 1` |
| Cookie | SameSite=Lax |

---

## 6. Input Validation

All inputs validated with **Zod** schemas before service layer:

```typescript
const CreateExpenseSchema = z.object({
  assetId: z.string().uuid(),
  amountPaise: z.bigint().positive(),
  expenseDate: z.string().date(),
  // ...
});
```

- SQL injection: Drizzle parameterized queries only
- XSS: React auto-escaping; sanitize rich text if added later
- Path traversal: blob paths generated server-side, never from user input

---

## 7. File Upload Security

| Control | Detail |
|---------|--------|
| Auth required | All uploads behind session |
| MIME validation | Allowlist: image/*, application/pdf |
| Size limit | 10 MB per file (configurable) |
| Filename sanitization | Strip path components |
| Storage | Private Vercel Blob — no public URLs |
| Access | Proxy route `/api/capital/files/[id]` with session check |
| Path convention | Server-generated `capital/documents/{asset_id}/...` |

---

## 8. Rate Limiting

| Endpoint | Limit |
|----------|-------|
| POST `/api/capital/auth/login` | 5 / 15 min / IP |
| POST Server Actions (mutations) | 60 / min / session |
| GET `/api/capital/export/*` | 10 / hour / session |
| GET `/api/capital/search` | 120 / min / session |

Implementation: in-memory sliding window (Phase 1); Redis if needed at scale.

---

## 9. Audit Logging

Every security-relevant event logged to `ac_activity_log`:

| Event | Logged data |
|-------|-------------|
| Login success | IP, user agent, timestamp |
| Login failure | IP, attempted email (hashed), timestamp |
| Logout | Session ID |
| Financial mutation | before/after state JSON |
| Export | report type, format, parameters |
| Settings change | changed fields |
| Document access | document ID (optional, Phase 2) |

Logs are append-only. No deletion UI.

---

## 10. Data Protection

### 10.1 At Rest

- Neon encryption at rest (provider default)
- Password: scrypt hash only
- Session tokens: SHA-256 hash only

### 10.2 In Transit

- HTTPS enforced (Vercel)
- HSTS via Vercel default
- No sensitive data in URL query params

### 10.3 Secrets Management

| Secret | Storage |
|--------|---------|
| `INVEST_DATABASE_URL` | Vercel env (encrypted) |
| `INVEST_AUTH_SECRET` | Vercel env |
| `INVEST_ADMIN_PASSWORD` | Vercel env (seed only) |
| `INVEST_BLOB_READ_WRITE_TOKEN` | Vercel env |

Never commit to git. `.env.example` has placeholder keys only.

---

## 11. HTTP Security Headers (Capital Layout)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; img-src 'self' blob: data:; ...
```

Applied via `next.config.ts` headers for Capital routes or layout meta.

---

## 12. Dependency Security

- `npm audit` in CI
- Pin major dependency versions
- No eval, no dynamic require of user input
- Sentry for runtime error monitoring

---

## 13. Incident Response

| Scenario | Action |
|----------|--------|
| Suspected breach | Revoke all sessions (`UPDATE ac_auth_sessions SET revoked_at = now()`) |
| Password compromise | Update hash in DB + revoke sessions |
| Data corruption | Restore Neon PITR + ledger rebuild script |
| Blob leak | Rotate blob token + audit access logs |

---

## 14. Security Testing Checklist

- [ ] Unauthenticated access to all protected routes → redirect/401
- [ ] PG routes on invest host → 404
- [ ] Capital routes on www host → 404
- [ ] Invalid session cookie → rejected
- [ ] Expired session → redirect to login
- [ ] Revoked session → rejected
- [ ] Login rate limit triggers after 5 failures
- [ ] Document proxy without auth → 401
- [ ] Document proxy with wrong ID → 404
- [ ] CSRF: cross-origin Server Action → rejected
- [ ] SQL injection in search → no effect
- [ ] File upload with executable MIME → rejected
- [ ] Ledger entries cannot be deleted via API

---

## 15. Non-Goals (Phase 1)

- 2FA / TOTP
- IP allowlisting
- Hardware security keys
- OAuth / SSO
- Encryption of individual fields
- SOC 2 compliance documentation
