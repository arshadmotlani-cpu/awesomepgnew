# Awesome PG — Production Sign-off Report

**Date:** 2026-07-10 (updated)  
**Target:** https://www.awesomepg.in  
**Scope:** Production readiness hardening (phases 3–18 code complete)  
**Latest wave:** RFE billing alignment, INV-04 invoice links, notifications SSOT migration, executive overview KPIs, activity timeline merge, 1150+ unit tests

---

## Code certification (2026-07-10)

| Gate | Status |
|------|--------|
| `npm run build` | PASS (local) |
| `npm test` | PASS — 1150+ tests |
| Lifecycle terminal hold cleanup | Shipped `d730f0d` |
| Billing RFE projections | `projectRentInvoiceAdminView` + resident RFE line map |
| INV-04 invoice detail from hub | `SimpleInvoiceCard` View invoice link |
| Notifications SSOT | `listAdminInboxNotifications` only |
| Executive metrics on overview | `getExecutiveMetrics` wired |
| Activity timeline | audit_log + invoice_audit_events merge |

**Live DB audits still require operator:** set `DATABASE_URL` and run `scripts/run-production-health-audit.ts`, `scripts/verify-production-p0.ts`, `scripts/production-readiness-simulation.ts`.

---

**Original report (2026-06-27):**

## Recommendation

### Ready with Minor Issues

The codebase, build, and architectural SSOT harnesses are in good shape. **Live production database verification could not be completed from this environment** because `DATABASE_URL` (and related Neon/Vercel integration secrets) are empty in all pulled env files — they are injected at deploy time only. Until an operator runs the audit suite against the live DB (or opens the admin audit pages while authenticated on production), full certification remains **blocked on one P0 operational step**, not on a known code defect.

**Why not “Ready for Production”:** No CLI audit output or admin UI gate snapshot from live data; no full resident journey E2E on production/staging; production `/api/health` returned `degraded: true` during this session (may be transient).

**Why not “Not Ready”:** Prior stabilization waves landed; build passes; targeted open bugs from the sign-off list were repaired; counter-parity and SSOT code paths are wired and unit-tested where applicable.

---

## Environment & audit execution

| Step | Command / URL | Result |
|------|---------------|--------|
| Pull production env | `vercel env pull .env.production.local --environment=production` | **PASS** (keys pulled) |
| DATABASE_URL available locally | All `.env*` files checked | **FAIL / BLOCKED** — values empty (Neon integration) |
| Health audit CLI | `npx tsx scripts/run-production-health-audit.ts` | **BLOCKED** — no DB URL |
| Issues audit CLI | `npx tsx scripts/production-issues-audit-report.ts` | **BLOCKED** — no DB URL |
| Unresolved actions audit | `npx tsx scripts/audit-open-unresolved-actions.ts` | **BLOCKED** — no DB URL |
| Billing readiness (HTTP) | `npx tsx scripts/billing-readiness-report.ts` | **FAIL** — HTTP 401 (CRON_SECRET not in pulled env) |
| `vercel env run production` | Attempted | **FAIL** — still empty DATABASE_URL |
| Production health endpoint | `GET /api/health` | **WARNING** — `{ degraded: true, fallback: true }` |
| Admin production audit UI | `/admin/system/production-audit` | **BLOCKED** — requires authenticated session + live DB |
| Admin financial audit UI | `/admin/system/financial-audit` | **BLOCKED** — same |

### Unblock live audits (operator)

1. Neon dashboard → copy pooled connection string → set `DATABASE_URL` in `.env.local` (or add to Vercel Development env as a non-integration var).
2. Re-run:

```bash
npx tsx scripts/run-production-health-audit.ts
npx tsx scripts/production-issues-audit-report.ts
npx tsx scripts/audit-open-unresolved-actions.ts
```

3. Authenticated browser: `/admin/system/production-audit` and `/admin/system/financial-audit` — capture gate PASS/FAIL screenshot.

For HTTP billing verify without local DB: export production `CRON_SECRET` from Vercel dashboard → `CRON_SECRET=… npx tsx scripts/billing-readiness-report.ts`.

---

## Module sign-off matrix

| Module | Status | Evidence |
|--------|--------|----------|
| **Overview** | WARNING | Priority Action Center + deduped metrics; counter parity harness; **live numbers unverified** |
| **Operations** | PASS | `loadResidentOperationsResidentsPage` SSOT; badge = `allQueueCount` |
| **Residents** | PASS | Lifecycle badges; `residentAdmin` list |
| **Resident Profile / RFE** | WARNING | RFE wired; **needs 5+ live resident spot-check** |
| **Bookings** | PASS | B-004 fixed — RFE `computedDuesPaise` only; dark theme applied |
| **Billing** | PASS | Billing command center; electricity wizard PG stickiness |
| **Revenue** | PASS | RFE-backed charts + command center |
| **Invoices** | PASS | Rent/electricity invoice flows |
| **Deposits** | WARNING | Ledger SSOT; Angatra / sample audit needs live DB |
| **Checkout** | PASS | Pipeline tabs; legacy Complete gated on bed map |
| **Payment Reviews** | PASS | `listPendingPaymentReviews` + integrity report |
| **Notifications** | WARNING | Bell on `notifications` SSOT; legacy `admin_notifications` read/archive only (N-001) |
| **Pricing** | PASS | Command center + pricing-health audit page (dark theme) |
| **PGs / Bed Map** | PASS | Dark cards; vacating settlement links |
| **Analytics** | PASS | Business metrics default |
| **Settings / Developer** | PASS | Hub; repairs in super_admin developer mode |
| **KYC** | PASS | PG-scoped parity fix in counter audit |
| **System Health** | WARNING | Harness exists; **live gate snapshot pending** |
| **Playstation admin** | PASS | UI-001 dark theme applied |
| **Continuous Residency Engine** | PASS | Prior wave; no regression in build |
| **Billing SSOT** | PASS | Billing center canonical |
| **Deposit Ledger** | WARNING | Live sample audit pending |
| **Checkout Settlement** | PASS | Pipeline + refund tab SSOT |
| **Notification SSOT** | WARNING | Live sync lag risk (P-001); mutation revalidation wired |
| **Pricing SSOT** | PASS | Command center + health report |
| **Payment Review SSOT** | PASS | Integrity report in production audit |

**Summary:** PASS 18 · WARNING 8 · FAIL 0 (code) · BLOCKED 4 (live DB / auth)

---

## Open bugs — sign-off repairs

| ID | Issue | Status | Fix |
|----|-------|--------|-----|
| **B-004** | Booking detail duplicate `stillDue` vs RFE | **FIXED** | Removed inline calc; display + offline payment default use `computedDuesPaise` |
| **UI-001** | Light theme on booking / pricing-health / playstation | **FIXED** | Dark `bg-[#1A1F27]` + `border-white/10` tokens |
| **RED-001** | 2-hop redirects rent/electricity → collections → billing | **FIXED** | Direct `/admin/billing?tab=rent|electricity`; overview + action deep links updated |
| **N-001** | Legacy `admin_notifications` archive | **PASS (verified static)** | New action sync writes `notifications` via `emitAdminNotificationsForActionItem` only; legacy table used for read/archive/dismiss lookups |
| **P-001** | Counter drift under load | **WARNING** | `revalidateAdminSurfaces()` on mutations; cron sync still required for background drift |

---

## Counter verification

| Metric | Overview source | Destination | Status |
|--------|-----------------|-------------|--------|
| Payment reviews | `ops.pendingPayments` | Payment reviews queue | PASS (harness) — **live unverified** |
| KYC pending | PG-scoped ops | KYC list (PG-scoped audit) | PASS (K-001 fix) |
| Refunds pending | `checkoutRefundsPending` | Checkout refund tab | PASS (R-001 fix) |
| Move-out notices | `leavingSoon` | Vacating pipeline | PASS |
| Beds releasing | `bedsReleasingSoon` | `/admin/vacating` | PASS (B-001 href fix) |
| Operations badge | Sidebar | `allQueueCount` | PASS (harness) |
| Rent / electricity links | Overview metrics | `/admin/billing?tab=*` | PASS (RED-001) |

---

## Financial verification

| Check | Status |
|-------|--------|
| RFE as SSOT for resident financials | PASS (architecture) |
| Booking detail uses RFE only | **PASS** (B-004) |
| `financialAudit` / deposit audit harness | PASS (code) — **live run blocked** |
| Multi-resident chain (profile → ledger → checkout) | **WARNING** — manual spot-check required |

---

## Resident journey (acceptance test)

| Stage | Status |
|-------|--------|
| Registration → booking → payment → admin approval → check-in | **NOT RUN** (requires production/staging E2E) |
| KYC → rent → electricity → payment proof → approval | **NOT RUN** |
| Extension → move-out → checkout → refund → bed release → history | **NOT RUN** |

Use [`docs/RESIDENT_JOURNEY_CHECKLIST.md`](RESIDENT_JOURNEY_CHECKLIST.md) once DB access or staging credentials are available.

---

## Performance

| Page | Status |
|------|--------|
| Overview, Residents, Billing, Revenue, Checkout, Bed Map, Resident Profile, Pricing, Analytics | **NOT MEASURED** — no production DB / no authenticated profiling session |

Optimize only after capturing slow queries from live admin pages or APM.

---

## Regression harness (local)

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** |
| `tests/unit/overviewDashboard.test.ts` | **PASS** |
| `tests/unit/actionDeepLinks.test.ts` | **PASS** |

---

## Remaining production blockers

| Severity | ID | Blocker | Action |
|----------|-----|---------|--------|
| **P0** | DB-001 | No exportable production DATABASE_URL locally | Paste Neon connection string or run audits on deployed admin UI |
| **P0** | AUD-001 | Full audit CLI suite not executed against live data | Run four scripts + capture production-audit UI |
| **P1** | E2E-001 | Full resident journey not executed on prod/staging | One lifecycle per checklist |
| **P1** | CRON-001 | CRON_SECRET not available for HTTP billing verify | Export from Vercel → re-run billing-readiness-report |
| **P2** | PERF-001 | No production performance baseline | Profile key admin pages after DB connect |
| **P2** | HEALTH-001 | `/api/health` returned degraded | Confirm on Vercel logs / DB connectivity |

---

## Evidence collected this session

1. **Build:** production build completed successfully.
2. **Env pull:** Vercel production env file created; DATABASE_URL keys present but empty (documented limitation).
3. **HTTP:** `https://www.awesomepg.in/api/health` → degraded response (timestamp: 2026-06-27 session).
4. **Code fixes:** B-004, UI-001, RED-001 diffs in working tree (booking detail, pricing-health, playstation, rent/electricity redirects, overviewDashboard, actionDeepLinks).
5. **Screenshots:** Not captured — admin audit routes require authenticated super_admin session.

---

## Sign-off checklist (owner)

- [ ] DATABASE_URL configured locally or audits run via authenticated production admin
- [ ] All production-audit gates PASS on `/admin/system/production-audit`
- [ ] Financial audit PASS on `/admin/system/financial-audit`
- [ ] Counter parity zero mismatches on live data
- [ ] One full resident journey on staging/production
- [ ] Billing readiness report READY (CRON verify)
- [ ] Deploy sign-off commit containing B-004 / UI-001 / RED-001 fixes

**Certifier:** _Pending operator completion of live DB audits and E2E checklist._
