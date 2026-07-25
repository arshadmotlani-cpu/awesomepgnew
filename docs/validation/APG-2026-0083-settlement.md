# APG-2026-0083 — legacy deposit ledger repair (ops)

**Booking:** APG-2026-0083 · **Type:** legacy data correction (not product / settlement engine change).

## Problem

Same checkout proof as APG-2026-0082 (₹6,180): rent ₹4,121 + deposit **₹2,059**. QR approval used `verificationOnly` and credited **full contract deposit** (₹4,121) on `deposit_ledger`, so move-out preview showed **₹4,121** estimated refund instead of **₹2,059**.

## Correction applied (production)

Script: `scripts/repair-0083-partial-deposit-ledger.ts` (append-only ledger).

| Action | Detail |
|--------|--------|
| Ledger | `deducted` **−₹2,061.80** (`DEPOSIT_COLLECTION_ADJUSTMENT`, reason `legacy_APG-2026-0083_half_deposit…`) |
| Effective deposit held | **₹2,059** (`refundableBalancePaise` = 205900) |
| Booking | `deposit_collection_status` → `partial`; `deposit_due_paise` aligned with 0082 split from ₹6,180 proof |
| Audit | `legacy_deposit_repair_0083`, `deposit_collected_adjusted`, backfill `partial_deposit_approved` (`legacyRepair: true`) |

Settlement engine unchanged — reads ledger refundable balance.

## Expected preview (after repair + BR-MOVEIN-COVERAGE)

| Line | Amount |
|------|--------|
| Deposit held (refundable) | **₹2,059** |
| Tail rent | ₹0 (same coverage as 0082) |
| Electricity / damages | At checkout lock |
| **Estimated refund (before elec/damages)** | **₹2,059** |

Re-verify:

```bash
USE_PRODUCTION_DB=1 npx tsx scripts/walkthrough-settlement-booking.ts --code APG-2026-0083
```

## Do not

- Add special-case deposit logic in settlement code for this booking.
- Delete or rewrite the original `collected` ledger row — adjustment is append-only.

**Parity reference:** APG-2026-0082 · proof row `pg_payment_records` `125daf11-7e03-4e0e-b4a5-386eae9e9f78`.
