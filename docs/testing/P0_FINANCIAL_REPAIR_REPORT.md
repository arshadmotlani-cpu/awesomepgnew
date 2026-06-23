# P0 Financial Repair Report

**Date:** 13 June 2026  
**Sprint:** P0 Financial Repair (ordered fixes 1–6)  
**Baseline:** [`FINANCIAL_DOMAIN_REPORT.md`](./FINANCIAL_DOMAIN_REPORT.md)

---

## Summary

| ID | Fix | Status |
|----|-----|--------|
| DR-03 | Fail-closed `recordPaymentSuccess()` financial mirrors | **Done** |
| DR-01 | `cancelBooking()` → `deposit_ledger.refunded` | **Done** |
| RV/INV/EB-P0-01 | Await unified invoice sync; surface errors | **Done** |
| INV-P0-02 | Fail-closed `refundUnifiedInvoice()` | **Done** |
| INV-PAY-01 | Fail-closed deposit line reversal on invoice refund | **Done** |
| DR-02 | Block legacy deposit refunds when checkout settlement exists | **Done** |

---

## 1. DR-03 — Fail-closed booking payment confirm

### Before

- Phase A: DB transaction confirmed booking + payment.
- Phase B: Deposit ledger, prior outstanding, overpayment in `try/catch` — errors logged, `{ ok: true }` returned.
- Overpayment without disposition only logged a warning.

### After

- **Phase A** unchanged: single `db.transaction` — payment insert, booking → `confirmed`, reservations → `active`, audit.
- **Phase B** (`applyBookingPaymentFinancialMirrors`): throws on any mirror failure including deposit credit transfer and undisposed overpayment.
- **Compensation** (`compensateFailedBookingPaymentConfirm`): payment → `failed`, booking reverted, reservations → `hold`, audit `payment_confirm_compensated`.
- Returns `{ ok: false, reason }` — booking confirmation does not succeed without financial mirrors.

### Transaction boundaries (documented in code)

```
Phase A — atomic db.transaction
Phase B — fail-closed; failure triggers compensation of Phase A
Phase C — notifications, automation, PS4 (best-effort, after Phase B success)
```

### Migration impact

None — behavior change only.

### Tables touched

`payments`, `bookings`, `bed_reservations`, `deposit_ledger`, `audit_log`

### Rollback plan

Revert `bookingLifecycle.ts` Phase B/compensation; restore swallowed catch (not recommended).

### Tests added

- Existing unit tests; build verification. Compensation path covered by `scripts/verify-deposit-ledger.ts` on staging.

---

## 2. DR-01 — Cancel booking deposit ledger refund

### Before

- `cancelBooking()` inserted `payments` refund row with `depositRefundPaise` in `rawPayload` only.
- No `deposit_ledger.refunded` or `deposit_settlements` row.

### After

- After cancel transaction, if `refund.depositRefundPaise > 0` and refund payment exists:
  - `settleDepositRefund()` with idempotency `cancel:{bookingId}:{refundPaymentId}`
  - Refund amount = `min(depositRefundPaise, refundableBalancePaise)`
- Cancel returns `{ ok: false }` if ledger settlement fails (booking already cancelled — ops alert).

### Migration impact

None. Historical cancels without ledger rows need one-time backfill (out of scope).

### Tables touched

`payments`, `deposit_ledger`, `deposit_settlements`, `bookings`, `audit_log`

### Rollback plan

Remove post-cancel `settleDepositRefund` block in `cancelBooking()`.

### Tests added

Extend `scripts/verify-cancel-refund.ts` with ledger assertions on staging.

---

## 3. RV/INV/EB-P0-01 — Unified invoice sync fail-closed

### Before

- `void syncRentInvoiceToUnified()` / `void syncManyToUnified()` on rent generate, overdue, expire, cancel batches.
- `syncRentInvoiceToUnified(...).catch(() => undefined)` on proof submit and reconcile paths.
- Same pattern on electricity bill create and cancel.

### After

- All P0 paths **await** sync; errors propagate to caller (batch generate fails visibly; proof submit fails).

### Affected code paths

| File | Paths |
|------|-------|
| `src/services/rentInvoices.ts` | `generateRentInvoicesForMonth`, `markOverdueInvoices`, `expireRentInvoicesPastDue`, `cancelFutureRentInvoices`, proof submit, reconcile sync |
| `src/services/electricityBilling.ts` | `createElectricityBill`, `recordElectricityPaymentSuccess`, `cancelElectricityInvoicesForBooking` |
| `src/services/vacatingCheckoutBilling.ts` | Rent cancel on vacating, uncancel on restore |

### Migration impact

None. Run `reconcileStaleFinancialInvoices` if historical drift exists.

### Tables touched

`rent_invoices`, `electricity_invoices`, `financial_invoices`

### Rollback plan

Restore `void` fire-and-forget (reintroduces silent drift).

### Tests added

Build + existing `scripts/verify-invoice-command-center.ts` on staging.

---

## 4. INV-P0-02 — Invoice refund fail-closed

### Before

- `financial_invoices.status` set to `refunded` **first**.
- `reverseBookingEffectsIfInvoiceVoided` errors swallowed with `.catch()`.

### After

1. `reverseInvoicePaymentAllocation(inv)`
2. Cancel source `rent_invoices` if applicable
3. `reverseBookingEffectsIfInvoiceVoided` — must succeed
4. Update `financial_invoices` → `refunded`
5. Audit log

On any failure: return `{ ok: false, error }`; invoice status unchanged until step 4.

### Migration impact

None.

### Tables touched

`financial_invoices`, `rent_invoices`, `payments`, `bookings`

### Rollback plan

Revert `refundUnifiedInvoice` ordering in `unifiedInvoices.ts`.

### Tests added

Existing invoice unit tests; manual admin refund on staging.

---

## 5. INV-PAY-01 — Deposit line reversal on invoice refund

### Before

- `applyDepositDeduction(...).catch(() => undefined)` on deposit breakdown lines.

### After

- Check `deducted.ok`; throw if false (bubbles to `refundUnifiedInvoice` catch).

### Migration impact

None.

### Tables touched

`deposit_ledger`

### Rollback plan

Revert `invoicePayment.ts` deposit branch.

### Tests added

Covered by INV-P0-02 integration path.

---

## 6. DR-02 — Canonical checkout settlement refund path

### Before

- Eight deposit refund entry points; legacy resident request, vacating, admin panel, quick refund could run alongside checkout settlement.

### After

- New `assertLegacyDepositRefundAllowed(bookingId)` in `src/lib/deposits/depositRefundGuard.ts`
- Blocks when non-archived `checkout_settlements` row exists for booking.
- **Canonical path unchanged:** `markCheckoutRefundPaid` → `settleDepositRefund(source: checkout)`

### Guarded entry points

| Entry | File |
|-------|------|
| `refundDepositAction` | `deposits/[bookingId]/actions.ts` |
| `processDepositSettlementAction` (approve) | `settlementActions.ts` |
| `quickRefundSettlementAction` | `quick-actions/actions.ts` |
| Resident request complete `deposit_refund` | `residentRequests.ts` |
| `settleVacatingDepositRefund` branch | `vacating.ts` |

### Migration impact

None. Bookings with open checkout must use `/admin/checkout-settlements`.

### Tables touched

Read-only check on `checkout_settlements`

### Rollback plan

Remove guard calls (reintroduces duplicate refund risk).

### Tests added

`tests/unit/depositRefundGuard.test.ts`

---

## Verification

```bash
npm test -- tests/unit/depositRefundGuard.test.ts tests/unit/depositSettlement.test.ts
npm run build
```

---

*All P0 items from FINANCIAL_DOMAIN_REPORT.md addressed in this sprint.*
