# Quick Sale & sales architecture

Technical reference for the walk-in POS (`/quick-sale`) and performance SSOT.

## Code map

| Area | Location |
|------|----------|
| UI | `src/hair/components/quick-sale/QuickSaleShell.tsx` |
| Server actions | `src/hair/actions/quickSale.ts` |
| Catalog / preview totals | `src/hair/services/quickSale.ts` |
| Hold bills | `src/hair/services/quickSaleHold.ts` |
| Invoice create / pay | `src/hair/services/invoices.ts` |
| Pricing math | `src/hair/lib/invoiceMath.ts` |
| Attributions | `src/hair/services/salesAttribution.ts` |
| Staff reports | `src/hair/services/staffPerformance.ts` |
| Commission scaffold | `src/hair/services/commissionEngine.ts` |

## Migrations

| Tag | Purpose |
|-----|---------|
| `0012_quick_sale` | `source`, tips, round-off, customer codes |
| `0013_sales_attribution` | Attributions + commission rules stub |
| `0014_quick_sale_stabilization` | `pos_draft`, commission rule future columns |

Run: `npm run hair:db:migrate`

## Attribution splits

- Persisted column: `share_bps` (basis points, sum ≤ 10_000 per line).
- UI sends staff IDs only → `normalizeEqualShares()` at persist time.
- Custom splits: pass `shareBps` per staff in `QuickSaleLineInput.servicedBy` (no schema change).

## Hold bill data model

- Draft invoice rows are normal `fyh_invoice_lines` + attributions.
- `pos_draft` JSON: `{ paymentDraft: { cash, upi, card, bank, wallet }, … }`.
- Checkout from hold reuses the same invoice id, assigns sequential invoice number, sets `status` to `unpaid`/`paid`, nulls `pos_draft`.

## Tests

```bash
npm run test:hair          # all tests/hair (unit + integration)
npm run hair:db:migrate    # required for integration tests
```

Integration tests skip with an explicit message if migrations `0012`–`0014` are missing (`tests/hair/integration/migrationGuard.ts`).

## Explicitly out of scope (next phase)

- Stock decrement and consumable kits on Quick Sale pay
- Package session redemption and membership benefit consumption beyond membership discount preview
- Commission rule evaluation (engine remains no-op)

See [FEATURES.md](./FEATURES.md) and [WORKFLOWS.md](./WORKFLOWS.md).
