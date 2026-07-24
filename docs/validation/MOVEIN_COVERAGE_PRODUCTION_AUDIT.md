# BR-MOVEIN-COVERAGE — production verification

**Generated:** 2026-07-24 (see `movein-coverage-production-audit.json` for timestamp)  
**Script:** `USE_PRODUCTION_DB=1 npx tsx scripts/audit-movein-coverage-production.ts`

## Scope

Scanned all `confirmed` / `completed` / `pending_payment` bookings for risk tags:

| Tag | Meaning |
|-----|---------|
| `partial_deposit` | `deposit_due_paise > 0` or received &lt; required |
| `custom_deposit_below_contract` | Deposit received &lt; `deposit_paise` |
| `legacy_movein_invoice` | Paid invoice anniversary ends on move-in, starts before move-in |
| `first_cycle_invoice` | Invoice period end equals move-in |
| `movein_day_clamp_candidate` | Clamped paid coverage is a single day (move-in only) |
| `moveout_in_first_billing_cycle` | Vacating date within first residency anniversary period |

For each risk booking, compared **paid coverage** and **estimated refund** (approval preview path, `treatAsApprovedForTail: true`) **before** vs **after** `expandMoveInCheckoutPeriodCoverage` (BR-MOVEIN-COVERAGE).

## Summary

| Metric | Count |
|--------|------:|
| Risk-tagged bookings | **16** |
| With open/completed vacating | **15** |
| BR-MOVEIN-COVERAGE expansion applied | **5** |
| **Estimated refund changed** | **3** |

## Bookings whose refund changed after the fix

These had **incorrect tail rent** under pre-fix clamped coverage (move-in day only). After expansion, vacate falls **inside** the paid first residency window → tail **0** → refund = refundable deposit (minus notice/elec as applicable).

| Booking | Vacating | Before | After | Δ | Tail before → after | Notes |
|---------|----------|-------:|------:|--:|---------------------|--------|
| **APG-2026-0045** | 2026-07-21 | ₹1,511 | **₹3,846** | +₹2,335 | ₹2,335 tail → 0 | Move-in 2026-07-04; coverage 2026-07-04→2026-08-04 |
| **APG-2026-0082** | 2026-08-20 | ₹0 | **₹2,059** | +₹2,059 | ₹4,121 tail → 0 | Partial deposit; Govind Kumar case |
| **APG-2026-0083** | 2026-08-20 | ₹0 | **₹4,121** | +₹4,121 | ₹4,121 tail → 0 | Full deposit; same invoice pattern as 0082 |

**Action:** Re-run admin approval / settlement preview for these three before payout. Update any stale UI snapshots that still show pre-fix refunds.

## Expansion applied — refund unchanged

| Booking | Why refund stable |
|---------|-------------------|
| **APG-2026-0048** | Vacating **on** first period end (2026-08-07); tail already **0** before and after. Coverage still corrected (2026-07-07→2026-08-07) for notice/prepaid SSOT. |
| **APG-2026-0040** | No vacating request; coverage-only fix for future move-out. |

## Risk bookings — expansion **not** applied (correct)

| Booking | Reason |
|---------|--------|
| **APG-2026-0076** | Rent received **₹660** &lt; monthly **₹4,121** — BR-MOVEIN-COVERAGE requires full month rent received. Tail unchanged (1 day). |

## Other risk-tagged bookings (no coverage expansion)

**APG-2026-0006, 0007, 0010, 0015, 0016, 0027, 0032, 0033, 0035, 0036** — tagged mainly for partial/custom deposit or legacy invoice shape, but **no** move-in-day clamp + full rent combo; paid coverage before/after identical; **refund delta 0** (where vacating exists).

## Paid coverage examples (after fix)

| Booking | Before (clamped) | After (BR-MOVEIN-COVERAGE) |
|---------|------------------|----------------------------|
| 0082 / 0083 | 2026-07-21 → 2026-07-21 | 2026-07-21 → **2026-08-21** |
| 0045 | 2026-07-04 → 2026-07-04 | 2026-07-04 → **2026-08-04** |
| 0048 | 2026-07-07 → 2026-07-07 | 2026-07-07 → **2026-08-07** |
| 0040 | 2026-07-01 → 2026-07-01 | 2026-07-01 → **2026-08-01** |

## Re-run

```bash
USE_PRODUCTION_DB=1 npx tsx scripts/audit-movein-coverage-production.ts
```

Artifact: [`movein-coverage-production-audit.json`](movein-coverage-production-audit.json)
