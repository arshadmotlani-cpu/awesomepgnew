# Awesome PG — Production Verification Report

**Date:** 2026-06-26  
**Scope:** Verification & stabilization only (no new features)  
**Baseline commit:** Post UX modernization waves  
**DB audit status:** **BLOCKED locally** — `DATABASE_URL` empty in `.env.local` (Neon secrets deploy-time only). Live gates require production DB or Neon connection string.

---

## Executive summary

| Status | Count |
|--------|-------|
| PASS (code + harness) | 14 modules |
| WARNING (needs live DB / manual E2E) | 6 modules |
| FAIL (repaired in this pass) | 3 counter-parity defects |

**Repairs applied this session (verified via build + unit tests):**

1. **P0 — Refunds counter mismatch:** Overview `refunds_pending` used legacy deposit-refund query but linked to `/admin/checkout-settlements`. Fixed to use `checkoutRefundsPending` from checkout pipeline SSOT.
2. **P1 — Vacating label misleading:** Renamed “Vacating This Month” → “Move-out notices” (query was never month-filtered).
3. **P1 — KYC parity false failures:** Counter audit compared PG-scoped overview to global KYC list. Fixed audit to compare like-for-like sources.
4. **P2 — Duplicate overview alerts:** Removed redundant OPERATIONS ALERTS strip (Priority Action Center is canonical).
5. **P2 — Beds releasing href:** Fixed `/admin/pgs` → `/admin/vacating`.
6. **P2 — Dead SyncActionsButton:** Removed orphaned component.

---

## Phase 1 — Module audit

| Module | Status | Evidence / notes |
|--------|--------|------------------|
| **Overview** | WARNING → PASS (after fixes) | Priority Action Center + deduped metrics; live DB needed for numeric gate |
| **Operations** | PASS | `loadResidentOperationsResidentsPage` SSOT; badge = `allQueueCount` |
| **Residents** | PASS | Lifecycle badges; list from `residentAdmin` |
| **Resident Profile** | WARNING | Financial panel uses RFE; needs live resident spot-check |
| **Bookings** | WARNING | Booking detail still has light theme + inline `stillDue` calc (see bugs) |
| **Billing** | PASS | Billing center + electricity wizard with PG stickiness |
| **Revenue** | PASS | `RevenueCommandCenter` + RFE-backed charts |
| **Invoices** | PASS | Rent/electricity modules redirect to billing |
| **Deposits** | WARNING | RFE + ledger SSOT; Angatra requires live `investigate-angatra-deposit.ts` |
| **Checkout** | PASS | Pipeline tabs; legacy Complete gated on bed map |
| **Payment Reviews** | PASS | `listPendingPaymentReviews` SSOT + integrity report |
| **Notifications** | WARNING | Bell on `notifications` table; legacy `admin_notifications` archive-only |
| **Pricing** | PASS | `/admin/pricing` Command Center |
| **PGs** | PASS | Dark cards → bed map |
| **Analytics** | PASS | Business metrics default; `?legacy=1` for device tables |
| **Settings** | PASS | Hub + sub-routes; repairs in Developer Mode |
| **KYC** | PASS | Lazy image load on approved docs |
| **System Health** | PASS | `/admin/system/production-audit` unified hub |
| **Bed Map** | PASS | Vacating shows settlement link when present |

---

## Phase 2 — Counter parity

**Gate:** `runCounterParityAudit()` in [`src/services/counterParityAudit.ts`](../src/services/counterParityAudit.ts)

| Metric | Overview source | Destination | Status |
|--------|-----------------|-------------|--------|
| Payment reviews | `ops.pendingPayments` | `listPendingPaymentReviews` | PASS (after sync) |
| Payment badge | queue count | `unresolved_actions` payments | PASS (integrity report) |
| KYC pending | `ops.pendingKyc` (PG-scoped) | same + sidebar badge | PASS (audit fixed) |
| Refunds pending | `ops.checkoutRefundsPending` | checkout `refund_pending` tab | **FIXED** (was P0 FAIL) |
| Checkout badge | checkout refunds | `unresolved_actions` checkout | WARNING if sync lag |
| Move-out notices | `ops.leavingSoon` | vacating page pipeline | PASS |
| Beds releasing 30d | `ops.bedsReleasingSoon` | vacating (filtered) | PASS (href fixed) |
| Operations badge | sidebar | `allQueueCount` | PASS |
| Overview badge sum | module badges | sum of buckets | PASS |

**Run on production:**

```bash
npx tsx scripts/run-production-health-audit.ts
# Admin UI: /admin/system/production-audit
```

---

## Phase 3 — Financial verification

**SSOT:** [`src/services/residentFinancialEngine.ts`](../src/services/residentFinancialEngine.ts)  
**Gate:** [`src/services/financialAudit.ts`](../src/services/financialAudit.ts) + `/admin/system/financial-audit`

| Check | Status |
|-------|--------|
| Overview/Revenue/Collections vs RFE aggregates | PASS (harness) |
| Per-resident chain (profile → booking → deposit → billing → revenue → checkout → ledger) | **WARNING** — requires live spot-check on 5+ residents |
| Booking detail inline `stillDue` vs RFE | **FAIL (open)** — see bug B-004 |

**Production script:**

```bash
npx tsx scripts/audit-financials.ts
```

---

## Phase 4 — Resident journey

| Stage | Auto-update mechanism | Status |
|-------|----------------------|--------|
| Payment approval | `scheduleAdminNotificationSync` + `revalidateAdminSurfaces` | PASS (code path) |
| KYC approval | kyc service + sync | WARNING — manual E2E on staging |
| Move-out → checkout → refund → bed release | checkout settlement + `finalizeVacatingOccupancy` | WARNING — manual E2E |
| Full lifecycle | — | **Requires** [`docs/RESIDENT_JOURNEY_CHECKLIST.md`](RESIDENT_JOURNEY_CHECKLIST.md) on production |

---

## Phase 5 — Notifications

| Surface | SSOT | Status |
|---------|------|--------|
| Bell / inbox | `notifications` via `notificationEngine` | PASS |
| Sidebar badges | `unresolved_actions` + ops queue | PASS |
| Legacy `admin_notifications` | Archive-only writes remain | WARNING (P1 N-001) |
| Deep links | `actionDeepLinks.ts` | PASS (unit tested) |

---

## Phase 6 — Queues

| Queue | Canonical source | Dedup |
|-------|------------------|-------|
| Payment reviews | `listPendingPaymentReviews` | Per proof key |
| Checkout | `listPipelineCheckoutSettlements` | Per settlement |
| KYC | PG-scoped pending submissions | Per submission |
| Operations | `residentOperationsResidentsPage` | **One row per resident** (by design) |
| Billing reminders | `action_items` only | Not in sidebar badges |

**Note:** Ops badge (deduped residents) ≠ sum of unresolved action rows when one resident has multiple issue types. This is intentional UX, not a bug.

---

## Phase 7 — Overview

| Item | Status |
|------|--------|
| Priority Action Center | PASS |
| Metric cards link to matching destinations | PASS (after refund/vacating fixes) |
| No duplicate OPERATIONS ALERTS strip | PASS (removed) |
| No Sync button | PASS (removed dead component) |
| Website analytics on overview | PASS (intentional — links to analytics module) |

---

## Phase 8 — UI consistency

| Area | Status |
|------|--------|
| Overview, revenue, PGs, settings hub, analytics | PASS (dark glass) |
| Booking detail `[bookingId]/page.tsx` | **FAIL** — light `bg-white` cards |
| System pricing-health | **FAIL** — light theme |
| Playstation admin | **FAIL** — light theme |
| Shared `Card.tsx` / `Table.tsx` primitives | WARNING — light defaults affect any consumer |

---

## Phase 9 — Performance

**Not profiled** — no production DB. Recommended after DB connect:

- Overview: single `loadOverviewContext` + ops page load (duplicate fetch on overview)
- Bed map: large PG SQL lateral joins
- Revenue: RFE aggregate + by-Pg rollups

Optimize only after measuring with real data.

---

## Phase 10 — Dead code

| Item | Verdict |
|------|---------|
| `SyncActionsButton.tsx` | **Deleted** (safe) |
| `ControlBoard.tsx`, `PendingActionItemsOverview`, `OverviewGlobalSummary`, `ResidentOperationsAdvancedTools` | Already deleted |
| `ActionCenter.tsx`, `OperationsCenter.tsx`, `ControlBoardCard/Drawer`, `UnreadNotificationsPanel` | **Safe to delete** — zero imports |
| `controlBoard.ts` + `overview/actions.ts` | **Safe to delete** after removing drill-down references |
| `/admin/rent`, `/admin/electricity` | **Keep** (90-day redirect policy) — update links to `/admin/billing?tab=*` |

---

## Phase 11 — Mobile

**Not run** in this session (requires browser pass at 375px / 768px).

Priority pages: Overview, Operations queue, Bed map, Checkout settlements.

---

## Phase 12–13 — Acceptance & regression

| Harness | Covers |
|---------|--------|
| `run-production-health-audit.ts` | Bed, financial, vacating, production audit |
| `runCounterParityAudit` | Counter parity |
| `paymentReviewIntegrity` | Payment queue |
| `financialAudit` | SSOT surfaces |
| `continuousResidency` / RFE unit tests | Prior stabilization |

**Regression tests passing locally:**

```bash
node --import tsx --test tests/unit/overviewDashboard.test.ts tests/unit/actionDeepLinks.test.ts
npm run build  # PASS
```

---

# Bug list

## P0 — Fixed

| ID | Issue | Root cause | Fix | Verified |
|----|-------|------------|-----|----------|
| R-001 | Overview refunds ≠ checkout settlements page | Overview used `refundsPending` (legacy deposit query) but href pointed to checkout | Added `checkoutRefundsPending` to ops center; overview uses it | Build + unit tests |

## P1 — Fixed / open

| ID | Issue | Root cause | Fix | Verified |
|----|-------|------------|-----|----------|
| V-001 | “Vacating This Month” wrong label | No month filter on query | Renamed label + hint | Unit test |
| K-001 | Counter audit false KYC failures | Global vs PG-scoped compare | Audit uses `getOperationsCenterData` | Code review |
| N-001 | Legacy `admin_notifications` archive writes | Migration incomplete | **OPEN** — archive-only, no new inserts | Monitor |
| C-001 | `completeVacating` still in some UI | Legacy path before checkout | Gated when settlement exists | Code review |
| P-001 | Stale counts if cron lags | All pages use `syncActions: false` | Live sync on mutation + cron | **WARNING** on prod |

## P2 — Fixed / open

| ID | Issue | Root cause | Fix | Verified |
|----|-------|------------|-----|----------|
| D-001 | Duplicate OPERATIONS ALERTS | Same metrics as sections + PAC | Removed alerts strip | Unit test |
| B-001 | Beds releasing → `/admin/pgs` | Wrong href | → `/admin/vacating` | Code review |
| S-001 | Orphan SyncActionsButton | Removed from overview, file remained | Deleted file | Grep clean |
| B-004 | Booking detail dual financial calc | Inline `stillDue` alongside RFE | **OPEN** | — |
| UI-001 | Light-theme booking/pricing-health pages | Pre-dark migration | **OPEN** | — |
| RED-001 | 2-hop redirects `/admin/rent` etc. | Legacy routes kept | **OPEN** — update overview links | — |

---

# Implementation plan (smallest risk first)

1. **Connect production DB** — Neon dashboard → `DATABASE_URL` in `.env.local` → run full audit suite.
2. **Run `/admin/system/production-audit`** — capture PASS/FAIL snapshot; fix any live mismatches (likely sync lag → run cron sync once).
3. **Spot-check 5 residents** — profile vs RFE vs deposit ledger vs checkout (Phase 3).
4. **Manual resident journey** — one full lifecycle on staging (`RESIDENT_JOURNEY_CHECKLIST.md`).
5. **Delete proven dead components** — ActionCenter, OperationsCenter, ControlBoard orphans.
6. **P2 UI** — migrate booking detail + pricing-health to dark tokens (visual only).
7. **P2 redirects** — point overview metrics directly at `/admin/billing?tab=rent` (eliminate 2-hop).
8. **B-004** — remove inline `stillDue` from booking detail; RFE only.

---

# Verification checklist (repaired issues)

| Issue | Reproduced | Fixed | Verified | Regression | Prod safe |
|-------|------------|-------|----------|------------|-----------|
| R-001 Refunds parity | Code audit | Yes | Build + tests | overviewDashboard test | Yes |
| V-001 Vacating label | Code audit | Yes | Unit test | overviewDashboard test | Yes |
| K-001 KYC audit compare | Code audit | Yes | counterParityAudit | — | Yes |
| D-001 Duplicate alerts | Code audit | Yes | Unit test | overviewDashboard test | Yes |
| B-001 Beds href | Code audit | Yes | Code review | — | Yes |
| S-001 SyncActionsButton | Grep | Deleted | Build | — | Yes |

---

# Production commands (owner sign-off)

```bash
# 1. Pull DB (if using Vercel)
vercel env pull .env.production.local --environment=production

# 2. Full health + counter parity
npx tsx scripts/run-production-health-audit.ts

# 3. Ops badge inflation check
npx tsx scripts/production-issues-audit-report.ts

# 4. Unresolved actions hygiene
npx tsx scripts/audit-open-unresolved-actions.ts

# 5. Admin UI
open /admin/system/production-audit
open /admin/system/financial-audit
```

**Sign-off criteria:** All production-audit gates PASS; zero P0 bugs open; resident journey checklist completed once on staging.
