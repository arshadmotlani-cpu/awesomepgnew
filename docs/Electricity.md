# Electricity

> Domain hub — room meter readings split among monthly occupants.

Cross-links: [[START_HERE]] · [[Billing]] · [[WORKFLOWS#Billing]]

---

## Purpose

Admin records **room-level meter readings**; system splits cost among active monthly occupants and generates per-booking `electricity_invoices`. Due 3 days after bill issued. Final bill at [[Checkout Settlements]] may use meter, average, or manual entry.

**SSOT:** `meterElectricity.ts`, `electricityBilling.ts`, `electricity_bills`, `electricity_invoices`

---

## Related features

- Admin electricity — `/admin/electricity`, `/admin/electricity/new`
- Resident pay — `/account/resident/pay-electricity/[invoiceId]`
- Tab in [[Billing]] hub
- Checkout placeholder until meter reading ([[WORKFLOWS#Billing]])

See [[FEATURES#Electricity]]

---

## Related workflows

[[WORKFLOWS#Billing]] — Electricity section · [[WORKFLOWS#Refund Processing]]

---

## Related routes

`/admin/electricity` · `/admin/revenue/billing` · resident pay routes

See [[ROUTES#Revenue & Billing]]

---

## Related database entities

`electricity_bills`, `electricity_invoices`, `rooms`, `bookings`

See [[DATABASE#Billing — Billing]]

---

## Related decisions

- [[DECISIONS#residentFinancialEngine as money SSOT]]
- [[DECISIONS#Unified financial_invoices registry]]

---

## Related hubs

[[Billing]] · [[Rooms]] · [[Residents]] · [[Checkout Settlements]] · [[Invoices]]
