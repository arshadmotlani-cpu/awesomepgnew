# Financial SSOT Audit Report

**Sprint:** P0 Production Financial Cleanup  
**Date:** 2026-07-02  
**Status:** Implemented

## Executive summary

This sprint establishes single sources of truth for billing cycles, financial reads, refunds, occupancy, and admin revenue UX. Legacy duplicate calculations and refund paths are removed or blocked.

## Engines delivered

| Engine | Path | Role |
|--------|------|------|
| Billing Cycle Engine | `src/lib/billing/billingCycleEngine.ts` | Permanent billing day, EOM clamp, anniversary detection, skip audit |
| Financial Metrics Engine | `src/services/financialMetricsEngine.ts` | All operating revenue reads; deposits as cash flow |
| Refund Console | `src/services/refundConsole.ts` + `/admin/refunds` | Only admin refund/deduct/transfer workflow |
| Occupancy SSOT | `src/lib/bedOccupancyEngine.ts` | Existing — verified on customer + admin surfaces |
| Bed Maintenance | `src/services/bedMaintenance.ts` | First-class status; website viewable, not bookable |

## Bugs fixed

1. **Late fee double-count** — `incomeRentPaise` already includes `paidLateFeePaise`; PG totals no longer add late fees twice.
2. **Deposits mixed into revenue** — Operating revenue excludes deposit collections; deposits shown as cash flow.
3. **Net inflow omitted electricity** — Cash inflow includes rent principal + late fees + electricity + deposits − refunds.
4. **Legacy refund paths** — Deposit detail refund/deduct actions redirect to Refund Console.

## Structured deductions

Categories in `src/lib/financial/deductionCategories.ts` with migration `0096_deduction_category.sql`:

- Electricity → Electricity Revenue
- All others → Other Income

## Admin UX

- **Revenue Command Center** — Read-only; totals from Financial Metrics Engine only.
- **Invoice Command Center** — Timeline moved to bottom, collapsed by default.
- **Refund Console** — Search booking; wallet grid; Pay Refund / Transfer / Deduct / View Ledger.
- **Second Grade Test** — Simplified labels ("Operating revenue", "Deposits collected").

## Verification

```bash
npx tsx scripts/verify-financial-ssot.ts
npm test
```

## Remaining follow-ups

- Production Neon validation with live `DATABASE_URL`
- Per-PG other income split (portfolio-level today)
- Checkout settlement UI may still display move-out flow; ledger writes remain canonical via `settleDepositRefund`
