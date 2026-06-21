# Invoices

> Domain hub — unified financial invoice registry across rent, electricity, deposit, and custom charges.

Cross-links: [[START_HERE]] · [[Billing]] · [[DECISIONS#Unified financial_invoices registry]]

---

## Purpose

**Single admin surface** to view, cancel, and share all invoice types via `financial_invoices` mirror. Professional **Tax Invoice** document at `/admin/invoices/[invoiceId]` and resident read-only mirror at `/account/resident/invoices/[invoiceId]`.

**SSOT:** `unifiedInvoices.ts`, `invoiceDocumentModel.ts`, `financial_invoices` table

---

## Invoice numbering (2026-06-22)

| Rule | Detail |
|------|--------|
| **New financial inserts** | `INV-{YEAR}-{PROPERTY_CODE}-{SEQUENCE}` e.g. `INV-2026-SHA-0142` |
| **Property code** | First segment of PG slug (3 chars uppercase), name fallback |
| **Sequence scope** | Unique per PG per calendar year in `financial_invoices` |
| **Callers** | Express walk-in deposit-only, custom charges, `invoiceGeneration`, express collection financial rows |
| **Rent-synced rows** | Keep mirroring `rent_invoices.invoice_number` (`RNT-*`) for backward compatibility via `syncRentInvoiceToUnified()` |

Implementation: `src/lib/billing/invoiceNumbering.ts`

---

## Document view

- **Model:** `getInvoiceDocumentDetail()` in `invoiceDocumentModel.ts`
- **UI:** `InvoiceDocument.tsx` — letterhead, stay dates, line items, totals, payment link/reference
- **WhatsApp:** `sendInvoiceOnWhatsApp.ts` — message + link to resident invoice page

---

## Related features

- `/admin/invoices`, `/admin/invoices/[invoiceId]` — admin Tax Invoice + Cancel / WhatsApp actions
- `/account/resident/invoices/[invoiceId]` — resident read-only invoice
- Mirrors rent, electricity, deposit, custom charges
- Express void (advanced collapsible on admin invoice detail only)

See [[features#Invoices (unified)]]

---

## Related routes

| Route | Role |
|-------|------|
| `/admin/invoices` | Registry list (clickable rows) |
| `/admin/invoices/[invoiceId]` | Tax Invoice document + actions |
| `/admin/invoices/[invoiceId]/print` | Print-friendly |
| `/account/resident/invoices/[invoiceId]` | Resident view (auth: owns invoice) |

See [[ROUTES#/admin/invoices]]

---

## Related database entities

`financial_invoices` (+ FKs to `rent_invoices`, `electricity_invoices`, etc.)

See [[DATABASE#Billing — Billing]]

---

## Related decisions

- [[DECISIONS#Unified financial_invoices registry]]
- [[DECISIONS#residentFinancialEngine as money SSOT]]

---

## Related hubs

[[Billing]] · [[Electricity]] · [[Deposits]] · [[Payment Links]] · [[Residents]]
