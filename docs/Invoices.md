# Invoices

> Domain hub — unified financial invoice registry across rent, electricity, deposit, and custom charges.

Cross-links: [[START_HERE]] · [[Billing]] · [[DECISIONS#Unified financial_invoices registry]]

---

## Purpose

**Single admin surface** to view, cancel, refund, and print all invoice types via `financial_invoices` mirror. Source mutations sync through `unifiedInvoices.ts`.

**SSOT:** `unifiedInvoices.ts`, `financial_invoices` table

---

## Related features

- `/admin/invoices`, `/admin/invoices/[invoiceId]`
- Mirrors rent, electricity, deposit, custom charges
- Cancel/refund through unified layer

See [[FEATURES#Invoices (unified)]]

---

## Related workflows

[[WORKFLOWS#Billing]] · cancel flows from admin invoice detail

---

## Related routes

`/admin/invoices` · `/admin/invoices/[invoiceId]`

See [[ROUTES#/admin/invoices]] · [[DECISIONS#Unified financial_invoices registry]]

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
