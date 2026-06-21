# Payment Links

> Domain hub — shareable UPI payment URLs for rent, deposit, and electricity.

Cross-links: [[START_HERE]] · [[Billing]] · [[Action Center]]

---

## Purpose

Admins create **one-time or reusable payment links** residents open to pay via UPI. Links can be generated from [[Action Center]] execution or admin panel.

**SSOT:** `paymentLinks.ts`, `payment_links` table

---

## Related features

- Admin create — `/admin/panel?tab=links`
- Public pay — `/pay/[linkId]`
- Used in [[WORKFLOWS#Billing]] collection flow

See [[features#Payment links (public)]] · [[features#Payment Links (admin)]]

---

## Related workflows

[[WORKFLOWS#Billing]] step 5 — resident pays via UPI proof or payment link

---

## Related routes

| Route | Role |
|-------|------|
| `/pay/[linkId]` | Public payment page |
| `/admin/panel?tab=links` | Admin management |

---

## Related database entities

`payment_links`, `payments`, linked invoice/booking FKs

---

## Related decisions

- [[DECISIONS#Payment proof vs Razorpay]]

---

## Related hubs

[[Billing]] · [[Deposits]] · [[Action Center]] · [[Notifications]] · [[Invoices]]
