# Phase 1 — Authentication & Session Stability — Findings

**Status:** Investigation complete (code + policy audit)  
**Date:** 2026-07-02  
**DB live query:** Blocked locally — Vercel-pulled env has empty `DATABASE_URL`. Re-run `USE_PRODUCTION_DB=1 npx tsx scripts/production-stabilization-audit.ts --write-docs` on a machine with Neon connection string.

---

## 1. Current architecture

| Component | Implementation |
|-----------|----------------|
| Session store | Postgres `auth_sessions` — opaque token, SHA-256 hash only |
| Cookie | `apg_customer_session` — httpOnly, sameSite=lax, secure in production |
| Standard TTL | **7 days** (`AUTH_CUSTOMER_SESSION_DAYS`, default in `env.ts`) |
| Remember-me TTL | **75 days** (`AUTH_CUSTOMER_REMEMBER_DAYS`) |
| Sliding refresh | When remaining ≤ **14 days** (`AUTH_CUSTOMER_SESSION_REFRESH_DAYS`) |
| Client ping | `CustomerSessionRefresh` — POST `/api/auth/customer/session/refresh` every **20 min** |
| Edge auth | `middleware.ts` — **cookie presence only** |
| Server auth | `getCustomerSession()` — DB validation + slide + archived filter |

**Key files:** `src/lib/auth/session.ts`, `customerSessionPolicy.ts`, `customerSessions.ts`, `CustomerLoginForm.tsx`, `app/api/auth/customer/login/route.ts`

---

## 2. Root causes (confirmed in code)

| Symptom | Root cause | Severity |
|---------|------------|----------|
| Frequent logout (7d users) | Standard session is only **7 days** without remember-me; refresh only extends when ≤14d remaining | High |
| Cookie present but "logged out" | Middleware allows entry; `getCustomerSession()` returns null (expired / archived / missing row) — **cookie not cleared** | High |
| Cannot log in | Split identity — phone vs email → different `customers` rows; archived rows | Critical |
| Password change logs out everywhere | `destroyAllCustomerSessions` — intentional | Expected |
| Remember-me always on for signup/reset | `rememberMe: true` hardcoded on those flows | Medium |
| No per-device revoke | Only list + revoke-all API | Medium |
| Session table bloat | No cron purge of `expires_at < now()` | Low |

---

## 3. Production vs local differences

| Factor | Local | Production (Vercel) |
|--------|-------|---------------------|
| Cookie `secure` | false | true |
| `AUTH_SECRET` | dev fallback | required at boot |
| `AUTH_CUSTOMER_*` env | defaults | **Not in DEPLOYMENT_CHECKLIST.md** — verify in Vercel dashboard |
| DB URL | Often empty in pulled `.env` | Injected at runtime only |

---

## 4. Investigation tasks completed

- [x] Code trace: login → session create → refresh → destroy paths
- [x] Policy defaults documented (`customerSessionPolicy.ts`, `env.ts`)
- [x] Remember-me default: API `rememberMe !== false` (defaults **on**)
- [x] UI default: checkbox checked in `CustomerLoginForm`
- [x] Archived account handling: lookup rejects; session join filters `archived_at IS NULL`
- [x] Audit script created: `scripts/production-stabilization-audit.ts`
- [ ] Live `auth_sessions` forensics — **pending DB access**
- [ ] Vercel env values for `AUTH_CUSTOMER_*` — **pending dashboard check**
- [ ] Mobile Safari matrix — **pending device test**

---

## 5. Recommended implementation (next PRs — not in this doc)

| Priority | Change | Effort |
|----------|--------|--------|
| P0 | Clear `apg_customer_session` when `getCustomerSession()` rejects (expired/archived) | 0.5d |
| P0 | Auth integrity sweep + split-identity repair (`/admin/system/auth-integrity`) | 2d |
| P1 | Raise standard session to **14–30 days** OR default remember-me with clear copy | 0.5d |
| P1 | Document `AUTH_CUSTOMER_*` in `DEPLOYMENT_CHECKLIST.md` | 0.25d |
| P1 | Per-session revoke API | 2d |
| P2 | Expired session purge cron | 1d |
| P2 | Optional middleware redirect on invalid cookie | 1d |

**No refresh-token pair needed** — sliding opaque sessions are sufficient if policy + cookie-clear are fixed.

---

## 6. Testing strategy

- Unit: `tests/unit/customerSessionPolicy.test.ts`, `customerSessions.test.ts`
- Integration: login → refresh → password change → revoke-all
- E2E: remember-me on/off, protected route after forced expiry (mock clock)
- Production: `scripts/production-stabilization-audit.ts` session stats

---

## 7. Rollback strategy

- Session duration changes are env-only — revert Vercel vars
- Cookie-clear on reject is safe — users re-login once
- Identity merge requires DB backup before repair scripts

---

## 8. Sign-off

| Role | Status |
|------|--------|
| Engineering investigation | Complete (code audit) |
| Production DB validation | **Blocked** — empty local DATABASE_URL |
| Implementation approval | Pending — see master roadmap P0 items |
