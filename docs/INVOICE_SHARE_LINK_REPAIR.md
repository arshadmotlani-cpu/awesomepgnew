# P0 Invoice Share Link Repair

## Root cause

WhatsApp “Send on WhatsApp” used `buildInvoicePublicUrl(invoiceId, 'resident')` → `/resident/invoices/{uuid}`.

That route:

1. **Required customer login** (middleware `needsCustomerAuth`)
2. Rendered inside **`(customer)` layout** — SiteHeader, CockroachAI, WorldShell (client components)
3. Used **`ResidentInvoiceDetailView`** — session + resident ownership checks; fails for parents/sponsors
4. Could **client-crash** in `InvoiceDocument` when `bookingPaymentSummary.allocationLines` was missing

External recipients saw login redirects or “Application error: a client-side exception has occurred”.

## Fix

| Before | After |
|--------|-------|
| `/resident/invoices/{uuid}` | `/i/{shareToken}` |
| UUID in URL | Opaque token only |
| Login required | Public, no auth |
| Customer shell + nav | Minimal standalone page |

### Share token SSOT

- Column: `financial_invoices.share_token` (unique, nullable until first share)
- `ensureInvoiceShareToken(invoiceId)` — create once, reuse forever
- `resolveInvoiceIdByShareToken(token)` — public page lookup

### Link generators audited

| Location | Fixed |
|----------|-------|
| `invoiceWhatsAppAction` | `buildInvoicePublicUrlForInvoice()` |
| `sendInvoiceOnWhatsApp.ts` | Token-based URLs only |
| Legacy `/resident/invoices/*` | Redirect → `/i/{token}` |
| `/account/resident/invoices/*` | Redirect → `/i/{token}` |

### Public page

- Route: `app/i/[shareToken]/page.tsx`
- No admin/resident navigation
- Server-rendered `InvoiceDocument` variant `resident`
- `robots: noindex`

## Verification

```bash
npm run db:migrate
npx tsx scripts/verify-invoice-share.ts --id=eaaa5e42-0c84-46da-937e-fbd2b93ce885
node --import tsx --test tests/unit/invoiceDeepLink.test.ts tests/unit/middlewareInvoiceAuth.test.ts
```

### Example URLs (production)

```
Share: https://www.awesomepg.in/i/{shareToken}
Admin: https://www.awesomepg.in/admin/invoices/eaaa5e42-0c84-46da-937e-fbd2b93ce885
```

Legacy WhatsApp links (`/resident/invoices/{uuid}`) redirect to the token URL automatically.

## Screenshots

Capture after deploy:

1. Public `/i/{token}` — invoice renders, no nav, pay button if due
2. Admin `/admin/invoices/{uuid}` — existing admin detail unchanged
