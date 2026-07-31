# Electricity Billing — Worked Examples

Generated for [ELECTRICITY_BILLING_AUDIT.md](ELECTRICITY_BILLING_AUDIT.md) section 2.

## Regenerating from production

When `DATABASE_URL` is configured:

```bash
npx tsx scripts/export-electricity-audit-samples.ts
```

This overwrites this file with 2–3 recent production bills that have `calculation_breakdown` persisted.

---

## Synthetic example (illustrates mid-cycle checkout + pro-rata)

This example matches the unit test in `tests/unit/buildRoomElectricityAuditView.test.ts` and demonstrates how a room bill splits when one resident vacates mid-month.

### Room 203 · June 2026

- Gross total: ₹2,080.00 (130 units × ₹16)
- Checkout credits: ₹420.00 (Resident B, collected at move-out)
- Splittable after credits: ₹1,660.00
- Operator rounding remainder: ₹820.00

| Resident | Check-in | Check-out | Days | Units | Allocated | Prev collected | Paid | Outstanding | Status |
|----------|----------|-----------|------|-------|-----------|----------------|------|-------------|--------|
| Resident A | 2026-06-01 | — | 30 | 65.00 | ₹840.00 | — | — | ₹840.00 | pending |
| Resident B | 2026-06-01 | 2026-06-15 | 15 | — | ₹0.00 | ₹1,260.00* | ₹420.00 | — | settled_at_checkout |

\* Prev collected sums checkout ledger fields (`creditApplied` + `collectedDuringCheckout` + `recoveredFromDeposit`) from the breakdown timeline.

**Sum check:** allocated ₹840 + credits ₹420 + remainder ₹820 = ₹2,080 gross ✓

---

## Production examples

Run the export script above to populate real Shanti Nagar / other PG room bills from the database.
