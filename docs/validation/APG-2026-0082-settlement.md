# APG-2026-0082 — Govind Kumar move-out settlement (ops)

**Booking:** APG-2026-0082 · **Fix:** BR-MOVEIN-COVERAGE (`expandMoveInCheckoutPeriodCoverage`) — tail rent no longer double-charges checkout month rent.

## Expected engine preview (after fix)

| Line | Amount |
|------|--------|
| Deposit held | ₹2,059 |
| Notice from deposit | ₹0 |
| Tail rent | ₹0 (vacate 2026-08-20 inside paid residency period 2026-07-21 → 2026-08-21) |
| Electricity | Pending final meter (deduct at checkout lock) |
| Damages | Pending inspection |
| **Estimated refund (before elec/damages)** | **₹2,059** |

Re-verify before approve:

```bash
USE_PRODUCTION_DB=1 npx tsx scripts/walkthrough-settlement-booking.ts --code APG-2026-0082
```

Approval preview should show **~₹2,059** estimated refund (not ₹0).

## Admin workflow (no booking-specific code)

1. **Approve vacating** when dates and notice are correct (vacating **2026-08-20**).
2. Resident submits refund details → checkout settlement created.
3. Enter **final electricity** (and damages if any) on checkout settlement; lock amounts.
4. **Final refund** = deposit remaining after electricity/other — expect **₹2,059 minus electricity** (and damages), not zero from tail rent.
5. Process UPI payout per normal checkout settlement flow.

## Do not

- Patch `checkout_settlements` or waterfall JSON by hand for this booking code in SQL.
- Waive tail rent via a one-off engine flag — the shared rule fix applies to all move-in-on-due-date checkouts with full month rent.

## Historical note

- Partial deposit (₹2,059 collected vs ₹4,121 contract) remains **BR-DEPOSIT-PARTIAL** — outstanding deposit due is separate from move-out refund.
- Single checkout payment **₹6,18,000** = full monthly rent + half deposit (historical exception; will not recur).

**Related:** [[BILLING_SETTLEMENT_BUSINESS_RULES#BR-MOVEIN-COVERAGE]] · `tests/unit/billingCoverageRegression.test.ts` Case F
