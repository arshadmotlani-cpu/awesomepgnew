# Operations Center — Full Audit Report

**Date:** 2026-07-02  
**Sprint:** Production Correctness & Polish — Operations restore  
**Principle:** Remove duplicate workflows, NOT remove functionality.

---

## Executive summary

All **12 critical business workflows** are present in the Operations command center at `/admin/operations`. This sprint **restored** super-admin dismiss, fixed filter-tag bugs (overdue mis-mapping), added missing **Deposit due** and **Refund** filter chips, kept **Waiting for payment** and **Payment approval** as separate states, and deduplicated booking approval when a payment proof is already pending.

**Permanently removed (prior sprints, confirmed still correct):** legacy maintenance task injection, financial audit placeholders, duplicate refund payout UI (Refund Console is SSOT for payout).

---

## Architecture (SSOT)

```
/admin/operations
  └─ loadUnifiedOperationsQueue()
       ├─ loadResidentOperationsResidentsPage()
       │    └─ buildResidentOperationsDashboard() + buildResidentOperationsResidentsView()
       ├─ listPendingBookingApprovals()
       ├─ listPendingPaymentReviews()  → Payment approval panel
       └─ listOutstandingDeposits()    → Deposit due rows
```

**UI:** `OperationsMasterQueue` (table) + `OperationsPaymentReviewsPanel` (payment approval only when `?filter=payment_proof`).

---

## Critical workflow verification (12/12)

| # | Workflow | Status | Filter chip |
|---|----------|--------|-------------|
| 1 | Waiting for Payment | ✅ Active | `waiting_for_payment` |
| 2 | Payment Approval | ✅ Active (panel + separate filter) | `payment_proof` |
| 3 | Rent Due | ✅ Active | `rent_due` |
| 4 | Electricity Due | ✅ Active | `electricity_due` |
| 5 | Deposit Due | ✅ Restored chip | `deposit_due` |
| 6 | Checkout | ✅ Active | `checkout` |
| 7 | Refund | ✅ Restored chip | `refund` |
| 8 | Booking Approval | ✅ Active (deduped vs payment proof) | `booking_approval` |
| 9 | Bed Assignment | ✅ Active | `bed_assignment` |
| 10 | Move-out Approval | ✅ Active (status label fixed) | `move_out` |
| 11 | KYC Review | ✅ Active | `kyc` |
| 12 | Overdue | ✅ Fixed (rent_overdue only) | `overdue` |

---

## Per-queue audit (7 questions each)

### 1. Waiting for Payment

| Question | Answer |
|----------|--------|
| **What creates it?** | Unpaid rent/electricity/deposit invoices via `buildCollectionsQueue` + `listOutstandingDeposits` |
| **What closes it?** | Invoice paid, cancelled, or `payment_in_progress` (proof uploaded → moves to Payment Approval) |
| **DB tables** | `rent_invoices`, `electricity_invoices`, `bookings` (deposit due) |
| **Admin action** | Send payment link / WhatsApp; resident pays or uploads proof |
| **Page** | `/admin/residents/{id}#open-bills` |
| **Should exist?** | **Yes** |
| **Where** | Operations table, chip `Waiting for payment`; merged per resident when multiple invoice types |

### 2. Payment Approval

| Question | Answer |
|----------|--------|
| **What creates it?** | Resident uploads screenshot or QR payment pending review |
| **What closes it?** | Admin approve/reject via payment actions |
| **DB tables** | `rent_invoices`, `electricity_invoices`, `payment_links`, `bookings` (deposit proof) |
| **Admin action** | Approve / reject screenshot in panel |
| **Page** | `/admin/operations?filter=payment_proof` → `OperationsPaymentReviewsPanel` |
| **Should exist?** | **Yes — never merged with Waiting for Payment** |
| **Where** | Dedicated panel above table; table rows hidden on this filter (no duplicate) |

### 3. Rent Due

| Question | Answer |
|----------|--------|
| **What creates it?** | Billing scheduler / manual rent invoice |
| **What closes it?** | Payment approved or cash settlement |
| **DB tables** | `rent_invoices` |
| **Admin action** | Collect payment / WhatsApp |
| **Page** | Resident open bills or invoice detail |
| **Should exist?** | **Yes** |
| **Where** | Operations chip `Rent due`; also in `waiting_for_payment` merge |

### 4. Electricity Due

| Question | Answer |
|----------|--------|
| **What creates it?** | Electricity billing run |
| **What closes it?** | `approveElectricityPaymentProof` or cash mark paid |
| **DB tables** | `electricity_invoices` |
| **Admin action** | Collect payment / WhatsApp |
| **Page** | `/admin/electricity` or invoice |
| **Should exist?** | **Yes** |
| **Where** | Operations chip `Electricity due`; excluded when proof pending |

### 5. Deposit Due

| Question | Answer |
|----------|--------|
| **What creates it?** | Onboarding / partial deposit via `listOutstandingDeposits` |
| **What closes it?** | Deposit payment recorded |
| **DB tables** | `bookings`, deposit wallet fields |
| **Admin action** | Collect deposit payment link |
| **Page** | `/admin/residents/{id}#open-bills` |
| **Should exist?** | **Yes** |
| **Where** | Operations chip `Deposit due` (restored this sprint) |

### 6. Checkout

| Question | Answer |
|----------|--------|
| **What creates it?** | Approved move-out → checkout settlement pipeline |
| **What closes it?** | Settlement completed / refund paid |
| **DB tables** | `checkout_settlements`, `vacating_requests` |
| **Admin action** | Review meter, approve settlement, complete checkout |
| **Page** | `/admin/checkout-settlements/{id}` |
| **Should exist?** | **Yes** |
| **Where** | Operations chip `Checkout`; move_out rows with checkout tag |

### 7. Refund

| Question | Answer |
|----------|--------|
| **What creates it?** | Settlement `refund_pending` or deposit refund queue |
| **What closes it?** | Refund marked paid in Refund Console |
| **DB tables** | `checkout_settlements`, `bookings.admin_deposit_refund_status` |
| **Admin action** | Pay refund |
| **Page** | `/admin/refunds?booking={id}` (Refund Console SSOT) |
| **Should exist?** | **Yes** |
| **Where** | Operations chip `Refund` (restored); payout only in Refund Console |

### 8. Booking Approval

| Question | Answer |
|----------|--------|
| **What creates it?** | Customer completes booking → `bookings.status = pending_approval` |
| **What closes it?** | Admin approves booking |
| **DB tables** | `bookings`, `bed_reservations` |
| **Admin action** | Review and approve booking |
| **Page** | `/admin/bookings/{id}` |
| **Should exist?** | **Yes** |
| **Where** | Operations chip `Booking approval`; skipped if payment proof pending for same booking |

### 9. Bed Assignment

| Question | Answer |
|----------|--------|
| **What creates it?** | KYC + payment cleared, no bed assigned |
| **What closes it?** | Admin assigns bed |
| **DB tables** | `customers`, `beds`, `bookings` |
| **Admin action** | Assign bed |
| **Page** | `/admin/beds?customerId={id}` |
| **Should exist?** | **Yes** |
| **Where** | Operations chip `Bed assignment` |

### 10. Move-out Approval

| Question | Answer |
|----------|--------|
| **What creates it?** | Resident submits vacating notice (`vacating_requests.status = pending`) |
| **What closes it?** | Admin approves move-out |
| **DB tables** | `vacating_requests` |
| **Admin action** | Approve move-out notice |
| **Page** | `/admin/vacating?status=pending` |
| **Should exist?** | **Yes** |
| **Where** | Operations chip `Move-out`; status `Waiting for Move-out Approval` |

### 11. KYC Review

| Question | Answer |
|----------|--------|
| **What creates it?** | Resident submits KYC |
| **What closes it?** | Admin approve/reject |
| **DB tables** | `kyc_submissions` |
| **Admin action** | Review documents |
| **Page** | `/admin/residents/kyc/{id}` |
| **Should exist?** | **Yes** |
| **Where** | Operations chip `KYC review` |

### 12. Overdue

| Question | Answer |
|----------|--------|
| **What creates it?** | Rent invoice past due date (`rent_overdue` category) |
| **What closes it?** | Payment received |
| **DB tables** | `rent_invoices` |
| **Admin action** | Collections / WhatsApp |
| **Page** | Resident open bills |
| **Should exist?** | **Yes** |
| **Where** | Operations chip `Overdue` — **only** `rent_overdue`, not rent_due/electricity_due |

---

## Payment lifecycle (verified)

```
Invoice Generated
    ↓
Waiting for Payment          (?filter=waiting_for_payment)
    ↓
Resident uploads screenshot
    ↓
Payment Approval             (?filter=payment_proof + panel)
    ↓
Admin Approve
    ↓
Invoice Paid
    ↓
Removed from all queues
```

**Never merged:** `waiting_for_payment` filter excludes `payment_proof` tag at item level (`isPaymentWaitingItem`).

---

## Restored this sprint

| Item | What was wrong | Fix |
|------|----------------|-----|
| Super-admin dismiss | Removed with `ResidentsOperationsActionQueue` | Restored in `OperationsOpsRowActions` |
| Deposit due chip | Only visible under waiting_for_payment | Added `deposit_due` filter |
| Refund chip | Only under checkout tag | Added `refund` filter |
| Overdue filter | rent_due + electricity_due incorrectly tagged overdue | SSOT tags in `buildUnifiedOpsFilterTags` |
| Payment approval count | Raw list vs dismissal mismatch | Filter `paymentReviews` by dismissal index |
| Booking + payment proof dup | Same booking in two rows | Skip booking approval when proof pending |
| Reason column | Status/outstanding conflated | Separate Reason + Outstanding columns |
| Move-out approval label | Generic "Waiting for Checkout" | "Waiting for Move-out Approval" when pending |

---

## Permanently removed (and why)

| Item | Why removed |
|------|-------------|
| Legacy `opsCenter.tasks` → maintenance tag | Mis-tagged KYC, refunds, electricity as maintenance |
| `financial_audit_review` on Operations | Placeholder rows with no admin action |
| `billing_failure` chip | Dev/scheduler tooling, not daily ops |
| `RefundRequestsOpsPanel` / `DepositSettlementPanel` | Duplicate payout UI — Refund Console is SSOT |
| `ResidentsOperationsActionQueue` | Superseded by unified queue (dismiss restored elsewhere) |
| Duplicate `waiting_for_admin_review` chip | Same count as payment_proof — one chip only |

---

## Manual workflow walkthrough

| Transition | Verified |
|------------|----------|
| Booking → Deposit due | ✅ `listOutstandingDeposits` |
| Deposit → Rent | ✅ Lifecycle suppresses lower priority during checkout |
| Rent → Electricity | ✅ Separate collection rows, merged in waiting_for_payment |
| Payment screenshot → Approval | ✅ Separate filter + panel |
| Approval → Paid → queue exit | ✅ collectionsQueue excludes paid / proof-pending |
| Move-out notice → Approval | ✅ vacating pending → move_out row |
| Checkout settlement → Refund | ✅ refund tag + Refund Console link |
| Re-booking | ✅ New booking approval row |
| Maintenance (beds) | ✅ Website pricing only — not Operations queue (intentional) |

---

## Remaining production risks

1. **`resident_request` excluded** from unified queue — still on `/admin/requests`; consider dedicated chip if volume grows.
2. **`action_items` cron sync** — parallel shadow queue on Overview/Control Board; not on Operations (by design).
3. **Deposit dismiss category** — uses `rent_due` category enum for DB; functional but imprecise.
4. **Blocked residents heuristic** — computed but not exposed as Operations chip (intentional — not duplicate).
5. **Journey stage counts** — loaded but not rendered on Operations page.

---

## Files changed (this sprint)

- `src/services/unifiedOperationsQueue.ts` — filter SSOT, deposit/refund chips, dedup, dismissals
- `src/lib/residents/residentOperationsResidentsView.ts` — overdue bucket fix, reason field
- `src/components/admin/operations/OperationsMasterQueue.tsx` — Reason/Outstanding columns
- `src/components/admin/operations/OperationsOpsRowActions.tsx` — dismiss restored
- `app/(admin)/admin/operations/page.tsx` — super-admin prop, payment approval copy
- `src/services/operationsQueueDismissals.ts` — deposit booking ID parse
- `tests/unit/unifiedOperationsQueue.test.ts` — filter tag tests
