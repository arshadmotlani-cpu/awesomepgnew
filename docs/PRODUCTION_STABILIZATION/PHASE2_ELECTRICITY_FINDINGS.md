# Phase 2 — Electricity Billing Validation — Findings

**Status:** Investigation framework complete; live Room 203 query pending DB  
**Date:** 2026-07-02  
**Incident:** Room 203 residents — monthly invoice ₹1,531 vs expected ~₹1,200 share each

---

## 1. Pipeline architecture

```
meter_logs → createElectricityBill → loadRoomElectricityOccupantsForMonth
  → credit waterfall (prepaid, checkout collections, manual credits)
  → allocateMonthlyElectricityInvoices → electricity_bills + electricity_invoices
  → syncManyToUnified → residentFinancialEngine → portal pay-electricity
```

**Checkout path:** `checkoutSettlement` → `electricity_settlement_ledger` (collected) → excludes settled residents from monthly split.

---

## 2. Root causes already known

| ID | Issue |
|----|-------|
| VAC-B5-01 | Harish 203 B5 — vacating/checkout/refund badge mismatch |
| CHK-ZERO-01 | Zero-refund checkout stuck when deposit consumed by notice + electricity |
| FIN domain | Electricity E2E **NOT VERIFIED** (`docs/testing/FINANCIAL_DOMAIN_REPORT.md`) |
| F8 | Operator absorbs paise remainder on split — by design |

**Harish settlement (documented):** ₹905 electricity + ₹595 notice on ₹1,500 deposit — checkout workflow may be incomplete, affecting June allocation credits.

---

## 3. Hypotheses for ₹1,531 vs ~₹1,200

| # | Hypothesis | Validation |
|---|------------|------------|
| H1 | Wrong occupant count in room | Compare `loadRoomElectricityOccupantsForMonth` vs physical beds |
| H2 | Checkout credit not applied to bill pool | Inspect `calculationBreakdown.checkoutCreditAppliedPaise` |
| H3 | Departed resident still in split | Check `listCheckoutSettledCustomerIdsForRoomMonth` exclusion |
| H4 | Harish ledger not `collected` | Query `electricity_settlement_ledger` + `checkout_settlements` |
| H5 | UI shows gross; resident expects net after credits | Compare admin breakdown vs `enrichBillDueRow` portal copy |
| H6 | Multi-bed multiplier (`bedCount` > 1) | Per-invoice `amountPaise` vs per-bed share |

---

## 4. Investigation tasks

### Automated (when DB available)

```bash
USE_PRODUCTION_DB=1 npx tsx scripts/production-stabilization-audit.ts --write-docs
npx tsx scripts/trace-room-203-harshad-electricity.ts
npx tsx scripts/verify-electricity-split.ts
npx tsx scripts/audit-repair-electricity-ownership.ts
```

### Manual SQL checklist (Room 203, billing month 2026-06-01)

1. `electricity_bills` — `gross_total_paise`, `calculation_breakdown`
2. `electricity_invoices` — per resident `amount_paise`, `status`
3. Sum(invoices) vs bill gross
4. `getElectricitySettlementLedgerView` — `reconciliation_gap_paise`, `is_balanced`
5. Harish `checkout_settlements` + `deposit_ledger` electricity lines
6. Portal amount for each resident vs admin bill detail

---

## 5. Files involved

| Area | Path |
|------|------|
| Bill creation | `src/services/electricityBilling.ts` |
| Share allocation | `src/lib/billing/roomElectricityMonthlyAllocation.ts` |
| Occupants | `src/lib/billing/roomElectricityOccupants.ts` |
| Checkout | `src/lib/checkout/roomElectricityAllocation.ts`, `src/services/checkoutSettlement.ts` |
| Ledger SSOT | `src/services/electricitySettlementLedgerView.ts` |
| Portal | `src/services/residentFinancialEngine.ts`, `ResidentAreaSection.tsx` |
| Scripts | `scripts/trace-room-203-harshad-electricity.ts`, `scripts/fix-room-203-june-electricity.ts` |

---

## 6. Dependencies

- Complete Harish checkout settlement before re-validating June bill
- Phase 4 UPI audit before resident payment sign-off

---

## 7. Recommended order

1. Read-only Room 203 forensic (scripts above)
2. Sign validation report (expected vs actual per resident)
3. Data repair only if mismatch confirmed (`fix-room-203-june-electricity.ts` with dry-run)
4. Code fix only if systematic (occupant filter, credit waterfall)
5. Regression test from Room 203 fixture

---

## 8. Effort estimate

| Workstream | Days |
|------------|------|
| Room 203 forensic | 3–4 |
| Cross-room parity | 2–3 |
| Fixes (if needed) | 3–5 |
| **Total** | **2–3 weeks** |

---

## 9. Testing strategy

- Unit: `roomElectricityMonthlyAllocation.test.ts`, `electricityBillBreakdown.test.ts`, `checkoutElectricitySettlement.test.ts`
- Script: `electricity-module-certification.ts`
- E2E: admin bill detail amount = portal pay page amount

---

## 10. Rollback strategy

- Repair scripts: dry-run first; DB snapshot before mutate
- Bill cancel/regenerate documented per `electricity_bills.id`
- No ledger deletes without compensating audit entry

---

## Sign-off

| Check | Status |
|-------|--------|
| Pipeline documented | Done |
| Live Room 203 data | **Pending DB** |
| Implementation | **Not started** — awaiting validation report |
