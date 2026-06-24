# PG Bulk Pricing Management

## Route

`/admin/pgs/[pgId]/pricing` — tab on PG setup nav (Super Admin apply).

## Architecture

```
PgBulkPricingPanel (client)
  → pricing-actions (server)
  → bulkPgPricing.ts
       → writeBedPriceVersion()  → bed_prices (time-versioned)
       → pg_price_revisions (audit)
       → pgPricingSafetyAudit (fingerprint before/after)
  → revalidatePricingViews(slug)  → public /pgs, booking flow
```

**SSOT for existing residents:** `bookings.pricing_snapshot` (frozen at checkout).  
**SSOT for new quotes:** `loadBedPrice` / `loadLatestBedPrice` on `bed_prices`.

## Root cause (pre-fix)

`updateRoomBedPricing` called `propagatePricingChangeForBeds`, which mutated:
- `bookings.deposit_paise` and `pricing_snapshot`
- pending `rent_invoices`
- `deposit_ledger` via `correctDepositCollected`

This violated pricing snapshot immutability when admins changed room rates.

## Business rules

| Surface | After bulk update |
|---------|-------------------|
| `bed_prices` | New row, `effective_from = today` |
| Future booking quotes | New rates |
| Existing `bookings` | Unchanged |
| `rent_invoices` / `financial_invoices` | Unchanged |
| `deposit_ledger` | Unchanged |
| `checkout_settlements` | Unchanged |
| Resident financial summary | Unchanged (reads booking snapshot) |

## Verification

```bash
npx tsx scripts/verify-pg-pricing-safety.ts --pg-id=<uuid>
npx tsx scripts/verify-pg-pricing-safety.ts --pg-id=<uuid> --dry-run-preview
```

After apply, re-run fingerprint — all hashes must match.

## Example (+5% rent +5% deposit)

| Bed | Rent before | Rent after | Deposit before | Deposit after |
|-----|-------------|------------|----------------|---------------|
| 101 B1 | ₹4,080 | ₹4,284 | ₹2,040 | ₹2,142 |
| 101 B2 | ₹4,080 | ₹4,284 | ₹2,040 | ₹2,142 |

Dhruv (existing booking rent ₹4,080, deposit ₹950) — unchanged forever unless admin manually revises tenancy.
