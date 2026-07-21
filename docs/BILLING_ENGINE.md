# Awesome PG Billing Engine

**Status:** Approved and in implementation.  
**Last updated:** 2026-07-21

This document locks the canonical billing architecture. The full design rationale lives in the approved plan; this file is the operational SSOT for engineers and ops.

---

## Locked product decisions

| Decision | Resolution |
|----------|------------|
| Monthly rent generation | **Automatic only** on billing anniversary (move-in day-of-month). No product UI for bulk or per-resident manual generation. |
| Calendar-month rent model | **Removed** from product surface. Super-admin repair tools only. |
| Daily/fixed-stay electricity | **Checkout-only** — never included in monthly room split. |
| Deposit | **Escrow only** — not spendable wallet money. |
| Overpayments / adjustments | **Resident Credit Balance** — separate ledger from deposit. |
| Late fee due date | **`invoice.due_date`** — never hardcoded day 5. |
| Mid-month electricity (monthly residents) | **Pro-rata by occupancy days** within the billing month. |
| Checkout gate (unfinalized room bill) | **Strict by default** — block settlement approval if checkout-month Workflow A is unfinalized and resident is not checkout-settled. Super-admin override with audit. |
| Auto-apply credit balance | **Default on** — credit auto-applies to next issued invoice (FIFO by due date). Residents may opt out via admin flag. |

---

## Two products, one platform

```
duration_mode ∈ { monthly, open_ended }           → Monthly Product
duration_mode ∈ { daily, weekly, fixed_stay }     → Fixed-Stay Product
duration_mode = reserve                           → Pre-arrival (no billing)
```

**Monthly:** anniversary rent, vacating + 14-day notice, monthly room electricity (Workflow A).  
**Fixed-stay:** upfront rent quote, checkout/refund-only exit, checkout-only electricity (Workflow B).

---

## Core modules

| Module | File | Role |
|--------|------|------|
| Billing scheduler | `src/services/billingScheduler.ts` | Daily IST anniversary generation + auto-retry |
| Upcoming schedule | `src/services/billingUpcomingSchedule.ts` | Next 14 days rent projection |
| Late fee math | `src/services/billing.ts` | Uses `invoice.due_date` |
| Meter timeline | `src/services/meterTimelineService.ts` | Only API for official baseline advance |
| Room electricity ledger | `src/services/roomElectricityLedger.ts` | Workflow A SSOT per room+month |
| Resident credit | `src/services/residentCreditLedger.ts` | Credit balance (not deposit) |
| Billing health | `src/services/billingHealth.ts` | Health score 0–100 + snapshot metrics |

---

## Meter timeline invariant

Only **Workflow A finalize** may call `advanceBaseline()`.  
Checkout readings call `recordCheckoutReading()` — writes settlement/contribution, **never** advances monthly baseline.

---

## Admin UI

**Billing Command Centre** (`/admin/billing`):

- Health tiles (overdue, due soon, failed generations, meter pending, checkout pending)
- Upcoming rent schedule (next 14 days)
- Exception queues — no "Generate Rent Bills" in product UI
- Diagnostics tab (super-admin): certification, meter timeline, repair actions

Manual rent generation is restricted to **super-admin repair tier** only.

---

## Idempotency keys

| Operation | Key |
|-----------|-----|
| Rent issue | `(booking_id, billing_month, is_recurring=true)` |
| Room electricity finalize | `(room_id, billing_month)` |
| Checkout settlement payout | `(settlement_id)` |
| Credit apply | `(invoice_id, customer_id)` |
