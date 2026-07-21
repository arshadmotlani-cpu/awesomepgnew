# Notice Deduction Policy Migration Plan

**Locked policy (2026-07-21)**

| Rule | Value |
|------|-------|
| Required notice | 14 calendar days (inclusive) |
| `noticeGivenDays` | `diff(notice_given_date, vacating_date)` |
| `missingNoticeDays` | `max(0, 14 - noticeGivenDays)` |
| `dailyRent` | `floor(monthlyRent / 30)` |
| Deduction | `chargeableNoticeDays × dailyRent` where `chargeableNoticeDays = missingNoticeDays − rentCoveredDays` (0 when compliant or fully covered) |

**Rent coverage (2026-07-21):** Days in the missing-notice charge window that fall inside a **paid rent invoice period** (or booking checkout rent for move-in month) are excluded from deposit deduction. Charge window = last N calendar days before vacating date, half-open `[vacatingDate − N, vacatingDate)`.

**Grandfathering:** Completed checkouts, completed refunds, and historical deposit-ledger entries are **not** modified.

**Auto-migrate:** `vacating_requests` in `pending` / `approved`, and open `checkout_settlements` (`awaiting_resident_details`, `awaiting_admin_review`, not `amounts_locked`).

---

## Phase 1 — SSOT billing engine

**File:** `src/services/billing.ts`

- Rewrite `computeNoticeDeduction()` → `dailyRateFromMonthly × noticeShortfallDays`
- Fix `noticeShortfallDeduction()` to multiply by `shortfallDays`
- Replace `vacatingPenalty()` / `VACATING_NOTICE_PENALTY_DAYS` with `maxNoticeDeduction()` (= 14 × daily) for worst-case previews only
- Keep `noticeShortfallDays()`, `isNoticeCompliant()`, `dailyRateFromMonthly()` unchanged

---

## Phase 2 — Downstream services

| File | Change |
|------|--------|
| `src/services/vacating.ts` | Header + ledger reason strings |
| `src/services/checkoutSettlement.ts` | Deduction plan reason uses `noticeShortfallDays`; reconcile comment |
| `src/services/depositSettlement.ts` | Ledger reason string |
| `src/services/productionFinancialReset.ts` | Fallback + reason string |
| `app/(admin)/admin/quick-actions/actions.ts` | Worst-case estimate via `maxNoticeDeduction` |
| `src/lib/financial/deductionCategories.ts` | Map old `5-day` strings + new missing-days strings to `notice_policy` |

---

## Phase 3 — UI

| File | Change |
|------|--------|
| `CheckoutSettlementPanel.tsx` | Pro-rata copy |
| `CheckoutSettlementSummary.tsx` | Show missing days, not "5-day fee" |
| `AdminVacatingSubmitForm.tsx` | Remove "fixed penalty" wording |
| `src/lib/guides/residentGuide.ts` | Policy copy |
| `src/lib/guides/adminGuide.ts` | Policy copy |
| `src/lib/cockroach/residentBriefing.ts` | Policy copy |
| `app/(admin)/admin/settings/policies/page.tsx` | 14 days (not 15) |

---

## Phase 4 — Tests

- `tests/unit/billing.test.ts` — full policy matrix
- `tests/unit/depositRefundUnlock.test.ts`
- `tests/unit/checkoutRefundPreview.test.ts`
- `tests/unit/checkoutSettlementDeductions.test.ts`
- `tests/unit/moveOutPipeline.test.ts`, `moveOutPipelineUi.test.ts`
- `tests/unit/zeroRefundCheckout.test.ts`
- `scripts/verify-vacating-deduction.ts`

---

## Phase 5 — Migration script

**File:** `scripts/migrate-notice-deduction-policy.ts`

1. Recompute `vacating_requests.deduction_paise` + `notice_compliant` for `status IN ('pending','approved')` where deduction was non-zero or notice non-compliant
2. Recompute open checkout settlements linked to those vacating rows (same status filter as reconcile)
3. Dry-run mode by default; `--apply` to write
4. Skip completed vacating, locked settlements, completed/refund_paid settlements

---

## Phase 6 — Documentation

Update formal docs: `DECISIONS.md`, `Vacating.md`, `Deposits.md`, `Billing.md`, `DATABASE.md`, `HANDOVER.md`, `START_HERE.md`, `SYSTEM/AI_CONTEXT.md`, `SYSTEM/WORKFLOWS.md`, `README.md`, `PHASE5_5_OPERATIONS.md`, schema comments.

---

## Verification

```bash
npm test -- tests/unit/billing.test.ts tests/unit/depositRefundUnlock.test.ts
npx tsx scripts/migrate-notice-deduction-policy.ts        # dry-run
npx tsx scripts/verify-vacating-deduction.ts
```
