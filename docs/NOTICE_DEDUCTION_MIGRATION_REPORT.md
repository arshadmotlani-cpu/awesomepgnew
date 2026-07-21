# Notice Deduction Policy — Migration Report

**Date:** 2026-07-21  
**Policy:** `deduction = missingNoticeDays × floor(monthlyRent/30)` where `missingNoticeDays = max(0, 14 − noticeGivenDays)`

---

## Summary

| Item | Result |
|------|--------|
| SSOT updated | `src/services/billing.ts` → `computeNoticeDeduction()` |
| Tests | **1295 passed**, 0 failed |
| Historical records | **Unchanged** (completed vacatings, paid refunds, ledger) |
| Active row migration | `scripts/migrate-notice-deduction-policy.ts` (dry-run default; `--apply` to write) |

---

## Files changed

### Phase 1 — SSOT billing engine

| File | Change |
|------|--------|
| `src/services/billing.ts` | Pro-rata `computeNoticeDeduction()`; fixed `noticeShortfallDeduction()`; added `maxNoticeDeduction()`; deprecated `vacatingPenalty()` / `VACATING_NOTICE_PENALTY_DAYS` |

### Phase 2 — Downstream services

| File | Change |
|------|--------|
| `src/services/vacating.ts` | Policy header; ledger reason uses missing day count |
| `src/services/checkoutSettlement.ts` | Deduction plan reason uses `noticeShortfallDays`; removed `VACATING_NOTICE_PENALTY_DAYS` import |
| `src/services/depositSettlement.ts` | Ledger reason string |
| `src/services/productionFinancialReset.ts` | `maxNoticeDeduction` fallback; reason string |
| `app/(admin)/admin/quick-actions/actions.ts` | Worst-case estimate via `maxNoticeDeduction()` |
| `src/db/schema/vacatingRequests.ts` | Schema comment |
| `src/db/queries/admin.ts` | Metrics comment |

### Phase 3 — UI

| File | Change |
|------|--------|
| `src/components/admin/checkout/CheckoutSettlementSummary.tsx` | Hint shows missing days × rent |
| `src/components/admin/CheckoutSettlementPanel.tsx` | Pro-rata policy copy |
| `src/components/admin/AdminVacatingSubmitForm.tsx` | Waive checkbox wording |
| `src/components/admin/quickActions/QuickActionResidentStep.tsx` | "Max notice deduction" label |
| `src/lib/guides/residentGuide.ts` | Policy copy |
| `src/lib/guides/adminGuide.ts` | Policy copy |
| `src/lib/cockroach/residentBriefing.ts` | Policy copy |
| `app/(admin)/admin/settings/policies/page.tsx` | 14-day notice (was 15) |

### Phase 4 — Tests & verification scripts

| File | Change |
|------|--------|
| `tests/unit/billing.test.ts` | Full policy matrix + pro-rata assertions |
| `tests/unit/depositRefundUnlock.test.ts` | Short-notice amount updated |
| `tests/unit/checkoutRefundPreview.test.ts` | Aatif scenario → ₹1,088 notice |
| `tests/unit/checkoutSettlementDeductions.test.ts` | Reason string assertion |
| `scripts/verify-vacating-deduction.ts` | Uses `computeNoticeDeduction()` |

### Phase 5 — Migration script

| File | Change |
|------|--------|
| `scripts/migrate-notice-deduction-policy.ts` | **New** — backfills `pending`/`approved` vacating + open checkout settlements |

### Phase 6 — Documentation

| File | Change |
|------|--------|
| `docs/NOTICE_DEDUCTION_MIGRATION.md` | Implementation plan |
| `docs/DECISIONS.md` | Updated decision record |
| `docs/Vacating.md` | Policy description |
| `docs/Billing.md` | SSOT reference |
| `docs/Deposits.md` | Policy description |
| `docs/DATABASE.md` | Column description |
| `docs/HANDOVER.md` | Policy summary |
| `docs/START_HERE.md` | Policy summary |
| `docs/SYSTEM/AI_CONTEXT.md` | Policy summary |
| `docs/SYSTEM/WORKFLOWS.md` | Workflow diagram label |
| `docs/SYSTEM_TRUTH_MAP.md` | SSOT pointers |
| `docs/MASTER_TEST_MATRIX.md` | Test matrix V-03 |
| `docs/AWESOME_PG_MASTER_DOCUMENTATION.md` | Policy summary |
| `README.md` | Runbook references |
| `PHASE5_5_OPERATIONS.md` | Vacating policy section |
| `docs/MEMORY/changelog.md` | Vault changelog entry |

---

## Deploy checklist

1. Deploy code.
2. Dry-run migration: `npx tsx scripts/migrate-notice-deduction-policy.ts`
3. Apply migration: `npx tsx scripts/migrate-notice-deduction-policy.ts --apply`
4. Verify: `npx tsx scripts/verify-vacating-deduction.ts` (against staging DB)

---

## Policy examples (₹4,080/mo → ₹136/day)

| Notice given | Missing days | Old deduction | New deduction |
|--------------|--------------|---------------|---------------|
| 14 days | 0 | ₹0 | ₹0 |
| 13 days | 1 | ₹680 | ₹136 |
| 10 days | 4 | ₹680 | ₹544 |
| 6 days | 8 | ₹680 | ₹1,088 |
| 0 days | 14 | ₹680 | ₹1,904 |

---

## Not changed (by design)

- Completed `vacating_requests` rows and `deduction_paise` snapshots
- Completed / refund-paid `checkout_settlements`
- `deposit_ledger` historical entries (including legacy "5-day rent penalty" reasons)
- `five_day_policy` deduction category (kept for historical ledger classification)
