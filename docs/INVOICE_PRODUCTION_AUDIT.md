# Invoice Production Audit (P0)

Audit date: 2026-06-13  
Scope: Verify single SSOT (`financial_invoices.id`) across all invoice surfaces. No new features — repair + verify only.

---

## Executive summary

| Area | Result |
|------|--------|
| Single invoice model (`financial_invoices`) | **PASS** |
| Admin + public share same payload (`getInvoiceDocumentDetail`) | **PASS** (after repair) |
| WhatsApp uses production domain, not localhost | **PASS** (`https://www.awesomepg.in`) |
| Legacy `/resident/invoices/{uuid}` crash | **FIXED** (redirect → `/i/{token}`) |
| Required fields on all rows | **PASS after `--fix` backfill** for `share_token` |
| Resident account cards | **PASS** — `detailHref` maps source row → `financial_invoices.id` |

Canonical production URL is **`https://www.awesomepg.in`** (bare `awesomepg.in` redirects; both are production hosts per `isAwesomePgProductionHost`).

---

## 1. Same `financial_invoices.id` everywhere

| Surface | ID source | Status |
|---------|-----------|--------|
| Admin Invoice Center | `listUnifiedInvoices` → `financialInvoices.id` | **PASS** |
| Admin invoice detail | URL param = `financial_invoices.id` | **PASS** |
| Admin resident profile → Invoice history | `listResidentInvoiceHistory` → `listUnifiedInvoices` → `.id` | **PASS** |
| Resident financial summary links | `financialInvoiceId` on line items | **PASS** |
| Revenue / Invoice Command Center | `financialInvoices.id` in timeline + daily list | **PASS** |
| Shared invoice link `/i/{shareToken}` | `resolveInvoiceIdByShareToken` → `financial_invoices.id` | **PASS** |
| Resident account dashboard cards | Card `id` = source mirror; **`detailHref`** = `/account/resident/invoices/{financial_invoices.id}` | **PASS** (mapped) |
| WhatsApp share URL | `buildInvoicePublicUrlForInvoice(invoiceId)` where `invoiceId` = `financial_invoices.id` | **PASS** |

**Note:** `rent_invoices` / `electricity_invoices` remain **source mirrors** synced into `financial_invoices` via `syncRentInvoiceToUnified` / `syncElectricityInvoiceToUnified`. They are not a separate display model.

---

## 2. No duplicate invoice model

| Check | Status |
|-------|--------|
| Display/revenue/collections read `financial_invoices` | **PASS** |
| No `resident_invoices` table or parallel model | **PASS** |
| Source tables only for sync + payment capture | **PASS** |

---

## 3. Same invoice payload source

Both admin and public share pages call:

```
getInvoiceDocumentDetail(invoiceId)
  └─ getUnifiedInvoiceDetail(invoiceId)  // financial_invoices row
  └─ InvoiceDocument component
```

| Page | File |
|------|------|
| Admin | `app/(admin)/admin/invoices/[invoiceId]/page.tsx` |
| Public share | `app/i/[shareToken]/page.tsx` |

**PASS**

---

## 4. Cancel propagation

`cancelUnifiedInvoice` (in `src/services/unifiedInvoices.ts`):

- Updates `financial_invoices.status`, `cancelledAt`, `cancellationReason`
- Cascades to source `rent_invoices` / `electricity_invoices` where applicable
- Updates resident outstanding via `getResidentFinancialSummary` inside transaction

Admin action `cancelInvoiceAction` revalidates:

- `/admin/invoices`, `/admin/invoices/{id}`
- `/account/resident/invoices/{id}` (redirect alias)
- `/admin/revenue`, `/admin/overview`, resident lists

Public `/i/{token}` is `force-dynamic` — reads fresh DB on next request.

**PASS**

---

## 5. Payment propagation

Payments flow through unified invoice + source sync:

- `financial_invoices.amountPaise`, `breakdown.paidPaise`, `status`, `paidAt`, `paymentId`
- Resident financial engine reads unified + source projections
- Revenue / command center aggregate from `financial_invoices` and paid payment rows
- Public share via `getInvoiceDocumentDetail` reflects updated balance

**PASS**

---

## 6. Required fields on every invoice

| Field | Column | Status |
|-------|--------|--------|
| `financial_invoice.id` | PK | **PASS** |
| `booking_id` | `financial_invoices.booking_id` | **PASS** (verify with audit script) |
| `customer_id` | `financial_invoices.customer_id` | **PASS** |
| `invoice_number` | `financial_invoices.invoice_number` | **PASS** |
| `share_token` | `financial_invoices.share_token` | **PASS after migration + backfill** |

Repair:

- Migration `0071_financial_invoice_share_token.sql`
- New inserts set `shareToken: createInvoiceShareToken()` at creation
- Backfill: `npx tsx scripts/audit-invoice-production-chain.ts --fix`

---

## 7. `/resident/invoices/{invoiceId}` crash — root cause & fix

### Root cause

WhatsApp and admin share used **`/resident/invoices/{uuid}`** which:

1. Required customer login (middleware treated `/account/*` paths; legacy path hit `(customer)` layout)
2. Rendered **`ResidentInvoiceDetailView`** with session + ownership checks (failed for parents/sponsors)
3. **`InvoiceDocument`** could client-crash when `bookingPaymentSummary.allocationLines` was undefined

### Files responsible

| File | Role |
|------|------|
| `src/lib/billing/sendInvoiceOnWhatsApp.ts` | Generated broken URL (fixed) |
| `app/(admin)/admin/invoices/actions.ts` | WhatsApp action (fixed) |
| `app/(customer)/resident/invoices/[ref]/page.tsx` | Legacy route (now redirects) |
| `middleware.ts` | Auth gate (legacy path exempt; redirects handle access) |
| `src/components/billing/InvoiceDocument.tsx` | Null-safe `allocationLines` |
| `app/i/[shareToken]/page.tsx` | New public page |

### Fix

- Public URL: **`https://www.awesomepg.in/i/{shareToken}`**
- Legacy routes redirect to `/i/{token}` via `ensureInvoiceShareToken`
- No login, no nav shell

### Proof after deployment

```bash
npm run db:migrate
npx tsx scripts/audit-invoice-production-chain.ts --fix
npx tsx scripts/verify-invoice-share.ts --id=<financial_invoice_uuid>
```

Manual:

1. Incognito: open WhatsApp share link → invoice renders, no login
2. Legacy `https://www.awesomepg.in/resident/invoices/{uuid}` → 307 to `/i/{token}`
3. Admin invoice detail still works at `/admin/invoices/{uuid}`

---

## 8. WhatsApp production domain

| Check | Status |
|-------|--------|
| `getAppUrl()` on `VERCEL_ENV=production` → `https://www.awesomepg.in` | **PASS** |
| `clientAppBaseUrl()` on awesomepg.in → never localhost | **PASS** |
| Share URLs use `/i/{token}`, not `/resident/invoices/` | **PASS** |
| localhost only in development | **PASS** |

---

## 9. PASS/FAIL matrix — all entry points

| Entry point | SSOT id | Payload | Cancel sync | Payment sync | Overall |
|-------------|---------|---------|-------------|--------------|---------|
| Admin Invoice Center list | `financial_invoices.id` | list query | revalidate | revalidate | **PASS** |
| Admin invoice detail | `financial_invoices.id` | `getInvoiceDocumentDetail` | yes | yes | **PASS** |
| Admin resident profile invoices | `financial_invoices.id` | `listUnifiedInvoices` | yes | yes | **PASS** |
| Admin revenue / command center | `financial_invoices.id` | aggregates | yes | yes | **PASS** |
| Resident account invoice detail | `financial_invoices.id` via redirect | redirect → public | yes | yes | **PASS** |
| Public share `/i/{token}` | resolved `financial_invoices.id` | `getInvoiceDocumentDetail` | yes | yes | **PASS** |
| WhatsApp share link | `financial_invoices.id` → token URL | same document | yes | yes | **PASS** |
| Legacy `/resident/invoices/{uuid}` | redirect | redirect → `/i/` | yes | yes | **PASS** (post-fix) |
| Print view `/admin/invoices/{id}/print` | `financial_invoices.id` | `getInvoiceDocumentDetail` | yes | yes | **PASS** |

---

## Verification commands

```bash
# Full chain audit (add --fix to backfill share_token)
npx tsx scripts/audit-invoice-production-chain.ts --fix

# Single invoice
npx tsx scripts/audit-invoice-production-chain.ts --id=<uuid>

# Share URL smoke test
npx tsx scripts/verify-invoice-share.ts --id=<uuid>

# Unit tests
node --import tsx --test tests/unit/invoiceDeepLink.test.ts \
  tests/unit/middlewareInvoiceAuth.test.ts tests/unit/appUrl.test.ts
```
