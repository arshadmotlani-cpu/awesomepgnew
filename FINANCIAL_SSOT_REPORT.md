# Financial SSOT Report (Stabilization)

**Updated:** 2026-06-13 — Phase 2 complete

## Canonical projection

`getResidentFinancialAccount` / `getBookingFinancialAccount` in `residentFinancialEngine.ts`

| Field | Source |
|-------|--------|
| Outstanding categories | Engine `buildRentCategory` / `buildElectricityCategory` |
| Deposit held | `deposit_ledger` via `getDepositSummaryForBooking` |
| Total outstanding | Sum of open invoice outstanding (no proof double-count) |
| Single-invoice math | `computeRentInvoiceOutstandingPaise` / `computeElectricityInvoiceOutstandingPaise` only |

## Wired surfaces

- Resident profile, booking detail, revenue command center, overview, PG revenue residents
- Customer portal (`ResidentAreaSection`), collections (`getRentStats` → engine)
- Action items sync amounts (via engine compute helpers, not direct `projectInvoice`)
- Operations center electricity cards (engine compute helpers)

## Write-path fixes (DR)

| ID | Fix |
|----|-----|
| DR-01 | `cancelBooking` calls `settleDepositRefund` when deposit refund due |
| DR-03 | `recordPaymentSuccess` compensates on ledger mirror failure (fail-closed) |
| DR-04 | Express walk-in logs `express_walkin_deposit_credit` audit entry |

## Removed duplicate calculations

- Revenue `totalOutstanding` += proof queue (fixed)
- `actionItems` / `operationsCenter` direct `projectInvoice` imports
- Customer portal due rows from SSOT line items
- `/admin/requests` standalone refund UI → redirect to checkout settlements

## Verification

```bash
npm run build
node --import tsx --test tests/unit/revenueSsot.test.ts tests/unit/financialEngineCompute.test.ts tests/unit/financialAudit.test.ts
```

Production: `/admin/system/financial-audit` — material checks must show zero difference.
