# Historical Sales Import

Import past salon sales from Excel into fully paid invoices that appear in revenue, GST, dashboard, and report queries — without staff attribution, commission, or inventory side effects.

## Template

Download from the app (**Settings → Historical import**) or from:

- `/fyh/imports/historical-sales-template.xlsx`
- `/fyh/imports/historical-sales-template.csv`

Regenerate committed templates:

```bash
npm run hair:import:template
```

## Columns (one row = one invoice)

| Column | Required | Notes |
|--------|----------|-------|
| `row_id` | Recommended | Stable idempotency key |
| `transaction_date` | Yes | Becomes invoice `createdAt` and `paidAt` |
| `customer_name` | Yes | Match or create customer |
| `customer_phone` | Recommended | Match key; synthetic phone if omitted |
| `description` | Yes | Single line item snapshot |
| `amount_inr` | Yes | GST-inclusive total (same as live POS) |
| `payment_method` | Yes | `cash`, `upi`, `card`, or `bank` |
| `gst_percent` | No | Defaults to salon setting (18%) |
| `discount_inr` | No | Line discount before GST split |
| `original_invoice_ref` | No | Stored in notes only |
| `quantity` | No | Default 1 |

## CLI

```bash
npm run hair:db:migrate
npm run hair:import:historical -- docs/foryourhair/imports/historical-sales-sample.xlsx
npm run hair:import:historical -- file.xlsx --dry-run
npm run hair:import:historical -- file.xlsx --force
```

## Architecture

- Pricing uses `priceLineFromParts` (same GST-inclusive math as BasketEngine)
- Invoices: `source = historical_import`, `status = paid`
- Ledger entries posted with historical timestamps
- `applyPaidSideEffects` is **not** run (no commission, stock, attributions)
- Idempotent via global unique `import_row_key` and file SHA-256 batch dedupe

## Access

Super-admin only: **Settings → Historical import**
