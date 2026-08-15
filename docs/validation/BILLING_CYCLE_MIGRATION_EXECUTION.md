# Billing cycle migration — execution report

Generated: 2026-08-15 (production execution)

## 1. Financial rule verification

Canonical proration: `floor(monthlyRentPaise × calendarDays / daysInMonth)` — never monthly÷30.

| Resident | Period | Days | Rent (snapshot) | Formula | Amount |
|----------|--------|------|-----------------|---------|--------|
| **Syed** | Jul 29–31 | 3/31 | ₹3,605.70 | floor(360570×3/31) | **₹348.93** |
| **Saswat** | Aug 13–31 | 19/31 | ₹4,120.80 | floor(412080×19/31) | **₹2,525.65** |

**Discrepancy resolution:**
- **₹233 (Syed):** Bug counted 2 days (exclusive-end error). Correct is 3 calendar days → ₹348.93.
- **₹349 / ₹2,526:** Rounding/display from slightly different rent snapshots; production uses `resolveMonthlyRentPaiseForBooking` at execution time.
- **₹2,393 (Saswat):** Bug counted 18 days instead of 19 → ₹2,525.65.

## 2. Saswat (APG-2026-0094)

| Field | Value |
|-------|-------|
| Old cycle | Anniversary day 8 |
| Paid coverage | Through 2026-08-12 (RNT-2026-08-0016) |
| Transition period | 2026-08-13 → 2026-08-31 |
| Transition amount | ₹2,525.65 (pending) |
| Invoice | RNT-2026-08-0018, `billing_cycle_transition`, due_date=null |
| Migration | `calendar_month_1st`, billing_day=1, first_auto=2026-09-01 |
| Sep 2026 cron | Eligible for September (transition unpaid — not treated as prepaid) |

## 3. Syed (APG-2026-0090)

| Field | Value |
|-------|-------|
| Old cycle | Anniversary day 28 |
| Paid coverage | Through 2026-07-28 (RNT-2026-07-0020) |
| Transition period | 2026-07-29 → 2026-07-31 |
| Transition amount | ₹348.93 (pending) |
| Invoice | RNT-2026-08-0019, `billing_cycle_transition`, due_date=null |
| August standard | RNT-2026-08-0020, ₹3,605.70, due 2026-08-19, pending |
| Migration | `calendar_month_1st`, billing_day=1, first_auto=2026-08-01 |
| Sep 2026 cron | Eligible for September standard invoice |

## 4. All other residents (15 policy-flip only)

All migrated to `calendar_month_1st`, billing_day=1, **no transition invoice**:

Ameen Huzaifa, Angatra Mandal, Anuj Harinkhede, CV Laxminarayana, Dhairya Zinzuvadiya, Dhruv, Disha Rangari, Ishan Jharia, Jahnavee Singh, KRISHNA ZODAGE, Manjusha Bhosale, Reetik khandekar, Rishik khobragade, Vijay Dilip Shinde, Waqar ahmad.

Next normal bill: 2026-09-01 (first_auto) except Ameen Huzaifa (2026-10-01).

## 5. Duplicate protection

- Standard invoices: UNIQUE(booking_id, billing_month) WHERE is_adhoc=false + cron `already_covered` skip
- Transition: idempotent duplicate check on period in notes before create
- Unpaid transition never extends paid-through coverage

## 6. Late fees

- Transition invoices: due_date=null, excluded from late-fee engine
- Standard invoices: 1%/day, 10% cap (unchanged)

## 7. Production counts

| Metric | Before | After |
|--------|--------|-------|
| calendar_month_1st active residents | 0 | **17** |
| Transition invoices created | 0 | **2** (Saswat + Syed) |

## 8. Tests

- `billingCycleCronCoverage.test.ts`: 12/12 pass
- `billingCoverageRegression.test.ts`: 10/10 pass
- `npm run test:billing-settlement`: 25/25 pass
- `npm run build`: pass

## 9. Execution

Automated via `executeBulkBillingCycleMigration` + `scripts/execute-billing-cycle-migration-production-fast.ts --execute`

Syed August backfill: `scripts/repair-syed-august-invoice.ts` (missed cron window fix)

## 10. Remaining

- Transition invoices for Saswat and Syed are **pending payment** (not marked paid — no invented payments)
- After transition payment, Sep 1 cron will generate September for both (no August double-charge for Saswat; Syed August already billed)
