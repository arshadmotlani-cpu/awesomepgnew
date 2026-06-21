# Billing

> Domain hub — rent, electricity billing, payment proof approvals, and revenue operations.

Cross-links: [[START_HERE]] · [[FEATURES#Billing hub]] · [[WORKFLOWS#Billing]]

---

## Purpose

Generate, track, and collect **monthly rent** and **electricity** charges for active residents. Support Razorpay auto-capture, UPI manual proof upload, late fees, pro-ration, and vacating checkout-month adjustments. All outstanding figures flow through [[DECISIONS#residentFinancialEngine as money SSOT]].

**SSOT:** `rentInvoices.ts`, `billing.ts`, `electricityBilling.ts`, `meterElectricity.ts`, `residentFinancialEngine.ts`, `vacatingCheckoutBilling.ts`

---

## Related features

- [[Billing]] hub — `/admin/revenue/billing` (rent, electricity, approvals tabs)
- [[Invoices]] unified registry — `/admin/invoices`
- [[Electricity]] meter bills and room split
- [[Payment Links]] — shareable UPI pay URLs
- Resident pay rent/electricity — UPI proof upload routes
- Revenue dashboard — `/admin/revenue`
- Late fee calculation (1%/day from 6th)
- Checkout-month pro-ration on [[Vacating]] notice

See [[FEATURES#Billing hub]] · [[FEATURES#Electricity]] · [[FEATURES#Invoices]]

---

## Related workflows

| Workflow | Steps |
|----------|-------|
| [[WORKFLOWS#Billing]] — Rent | Generate → pro-rate → due 5th → late fee → pay → approve proof |
| [[WORKFLOWS#Billing]] — Electricity | Meter reading → split occupants → invoice → pay → approve |
| [[WORKFLOWS#Vacating]] | `syncVacatingCheckoutRentBilling` on submit/approve |
| [[WORKFLOWS#Notifications]] | Rent/electricity due action items |

---

## Related routes

| Route | Role |
|-------|------|
| `/admin/revenue/billing` | **Canonical** billing hub |
| `/admin/revenue` | Revenue charts |
| `/admin/invoices`, `/admin/invoices/[id]` | Unified invoice registry |
| `/admin/electricity`, `/admin/electricity/new` | Electricity admin |
| `/account/resident/pay-rent/[invoiceId]` | Resident rent UPI proof |
| `/account/resident/pay-electricity/[invoiceId]` | Resident electricity UPI proof |
| `/pay/[linkId]` | Public payment link |

See [[ROUTES#Revenue & Billing]]

---

## Related database entities

| Table | Role |
|-------|------|
| `rent_invoices` | Monthly rent rows |
| `electricity_bills` | Room meter readings |
| `electricity_invoices` | Per-booking electricity charges |
| `financial_invoices` | Unified mirror for all invoice types |
| `payments` | Captured payments |
| `payment_proofs` | UPI screenshot approvals |
| `payment_links` | Shareable pay URLs |
| `bookings` | `pricing_snapshot` for rate source |

See [[DATABASE#Billing — Billing]]

---

## Related decisions

- [[DECISIONS#residentFinancialEngine as money SSOT]]
- [[DECISIONS#Unified financial_invoices registry]]
- [[DECISIONS#Payment proof vs Razorpay]]
- [[DECISIONS#Vacating checkout rent sync]]
- [[DECISIONS#Half-open stay ranges]] — pro-ration math
- [[DECISIONS#Pricing snapshot immutability]]

---

## Related hubs

[[Residents]] · [[Electricity]] · [[Invoices]] · [[Payment Links]] · [[Deposits]] · [[Vacating]] · [[Operations]] · [[Notifications]]
