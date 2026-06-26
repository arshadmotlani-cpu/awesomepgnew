# Awesome PG — Stabilization Baseline

**Date:** 2026-06-13  
**Phase:** 1 — Architecture Verification (read-only)  
**Repo HEAD migrations:** `0081_resident_residencies.sql`  
**Purpose:** Authoritative SSOT map, gap inventory, and phase assignment before stabilization implementation.

---

## Executive summary

| Area | SSOT | Status | Assigned phase |
|------|------|--------|----------------|
| Resident outstanding (read) | `residentFinancialEngine.ts` | Partially wired | 2 |
| Deposit money (write) | `deposits.ts` / `deposit_ledger` | DR-01–04 FAIL | 2 |
| Checkout / refund | `checkoutSettlement.ts` | Unit PASS; E2E NOT TESTED | 7 |
| Continuous residency | `continuousResidency.ts` (0081) | VERIFIED code | 6 |
| Billing scheduler | `billingScheduler.ts` + cron | READY per billing report | 8 |
| Notifications | 4 stores + computed queues | Mid-unification | 3 |
| Operations queue | `/admin/operations/residents` | Badge mismatch fix local | 4 |
| Booking / occupancy | `bed_reservations` GiST | NOT TESTED concurrency | 6 |
| Payment proof | `paymentProofQueue.ts` | Canonical execute path | 4, 8 |

---

## Subsystem verification

### Continuous Residency

| Item | Detail |
|------|--------|
| **SSOT** | `src/services/continuousResidency.ts` |
| **Schema** | `resident_residencies`, `residency_booking_links` (0081) |
| **Hooks** | `bookingLifecycle`, `tenantAssignment`, `fixedStayAutoExpiry` |
| **Status** | **VERIFIED** (code trace) |
| **Gap** | False checkout suppression requires every confirm path to call `ensureContinuousResidencyOnBookingConfirmed` |
| **Phase** | 6 |

### Financial SSOT (read)

| Item | Detail |
|------|--------|
| **SSOT** | `getResidentFinancialAccount`, `getGlobalFinancialAggregates` |
| **Audit** | `runFinancialHealthAudit`, `runFinancialIntegrityAudit` |
| **Wired** | Resident profile, booking detail, revenue outstanding, PG revenue residents, customer portal dues |
| **Status** | **NEEDS TEST** (production audit) |
| **Gaps** | `actionItems`/`operationsCenter` still project invoices; DR-01–04 write paths; async unified sync |
| **Phase** | 2 |

### Billing Scheduler

| Item | Detail |
|------|--------|
| **SSOT** | `billingScheduler.runDailyRentBillingJob` |
| **Cron** | `generate-monthly-rent` — 30 18 * * * UTC |
| **Status** | **VERIFIED** per BILLING_READINESS_REPORT |
| **Gap** | Private room billing (0076–0078) undeployed on prod |
| **Phase** | 8 |

### Checkout Engine

| Item | Detail |
|------|--------|
| **SSOT** | `checkoutSettlement.ts`, `checkout_settlements` |
| **Status** | **PASS** unit; **NOT TESTED** E2E |
| **Gaps** | VAC-CRASH-02, CHK-ZERO-01; 8 refund paths (DR-02); `/admin/requests` legacy |
| **Phase** | 7 |

### Resident Journey

| Item | Detail |
|------|--------|
| **SSOT** | `residencyJourney.ts`, `residentAccountContext.ts`, `ResidentAreaSection.tsx` |
| **Status** | **NOT TESTED** full E2E |
| **Gap** | X-01 hub vs admin parity; invoice hub nav (INV-04) |
| **Phase** | 5 |

### Payment Engine

| Item | Detail |
|------|--------|
| **SSOT** | `bookingLifecycle.recordPaymentSuccess`, `paymentProofQueue` |
| **Status** | **FAIL** DR-03 (ledger fail-open) |
| **Phase** | 2 |

### Notification Engine

| Item | Detail |
|------|--------|
| **Stores** | `action_items`, `admin_notifications`, `notifications`, `unresolved_actions` |
| **Sync** | `syncActionItems()` on admin layout |
| **Status** | **BROKEN** — bell list vs badge use different tables |
| **Phase** | 3 |

---

## Workflow status (from SYSTEM_TRUTH_MAP)

| # | Workflow | Status |
|---|----------|--------|
| 1 | Booking | NEEDS TEST |
| 2 | Booking Payment | NEEDS TEST |
| 3 | Payment Proof | NEEDS TEST |
| 4 | Revenue | VERIFIED read / NEEDS TEST cron |
| 5 | Invoices | NEEDS TEST sync |
| 6 | Deposits | **BROKEN** DR-01–04 |
| 7 | Deposit Transfers | **BROKEN** DR-04 |
| 8 | Rent Billing | VERIFIED |
| 9 | Electricity | NEEDS TEST |
| 10 | KYC | VERIFIED |
| 11 | Bed Assignment | NEEDS TEST |
| 12 | Resident Lifecycle | NEEDS TEST |
| 13 | Requests | **BROKEN** legacy parallel |
| 14 | Vacating | NEEDS TEST |
| 15 | Checkout Settlement | VERIFIED unit |
| 16 | Refunds | **BROKEN** multi-path |
| 17 | Wallet | NEEDS TEST |
| 18 | Notifications | **BROKEN** dual inbox |

---

## P0 backlog (ranked)

| ID | Issue | Phase | Owner action |
|----|-------|-------|--------------|
| DR-01 | Cancel booking skips deposit ledger refund | 2 | Fix `cancelBooking` |
| DR-02 | 8 refund paths; legacy `/admin/requests` | 2, 7 | Consolidate to checkout settlements |
| DR-03 | `recordPaymentSuccess` swallows ledger errors | 2 | Fail-closed transaction |
| DR-04 | Express walk-in deposit transfer unaudited | 2 | Audit log + snapshot |
| INV-P0-01 | Fire-and-forget unified invoice sync | 2 | Await sync on pay/generate |
| OPS-P0-01 | Operations badge ≠ queue (invoice_review) | 4 | Deploy 0077–0079 |
| NOTIF-P0-01 | Bell dropdown ≠ notifications table | 3 | Unify inbox |
| VAC-P0-01 | Vacating page crashes | 7 | Fix serialization/JOIN |

---

## Deploy lag

| Item | Repo | Production (expected) |
|------|------|----------------------|
| Latest migration | 0081 | 0075–0079 pending per PRODUCTION_ISSUES_REPORT |
| Financial SSOT wiring | Local | Partial |
| Ops badge fix | Local | Not deployed |
| Room 201 private billing | 0078 | Not deployed |

**Pre-Phase-2 gate:** Apply migrations 0076–0081 on production before financial deploy.

---

## Audit harness inventory

| Harness | Entry | Phase gate |
|---------|-------|------------|
| Financial surface | `/admin/system/financial-audit` | 2, 15 |
| Financial integrity | `financialIntegrityAudit` + cron | 2, 15 |
| System health | `/admin/system/health-report` | 15 |
| Bed audit | `runBedAudit` | 6, 15 |
| Vacating audit | `runVacatingAudit` | 7, 15 |
| Operations | `production-issues-audit-report.ts` | 4, 15 |
| Billing | `billing-readiness-report.ts` | 8, 15 |
| Smoke | `/admin/health` | 15 |

---

## Route drift

| Docs say | Code says |
|----------|-----------|
| `/admin/revenue/billing` | `/admin/billing` (canonical) |
| `/admin/collections` | Redirect chain → billing |
| `/admin/actions` | Redirect → overview |

**Phase 10** will align ROUTES.md and collapse redirects.

---

## Phase assignment map

```
Phase 2  → Financial (DR, SSOT, sync)
Phase 3  → Notifications unify
Phase 4  → Operations one queue
Phase 5  → Journey checklist
Phase 6  → Booking/residency
Phase 7  → Checkout/vacating
Phase 8  → Billing UX
Phase 9  → Admin UX simplify
Phase 10 → Navigation
Phase 11 → Mobile/PWA
Phase 12 → Performance
Phase 13 → Dead code
Phase 14 → Security
Phase 15 → Production gate
Phase 16 → Launch readiness
```

---

## Acceptance (Phase 1)

- [x] Every SYSTEM_TRUTH_MAP workflow has status
- [x] Deploy lag documented
- [x] P0 backlog ranked with phase assignment
- [x] No application code changes in this phase

**Signed:** Stabilization Phase 1 complete — proceed to Phase 2.
