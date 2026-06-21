# Residents

> Domain hub — verified tenants and per-resident admin command center.

Cross-links: [[START_HERE]] · [[features#Residents directory]] · [[WORKFLOWS#Resident Onboarding]]

---

## Purpose

Manage **confirmed tenants** after booking: financial summary, express collection, invoice history, bed assignment links, vacating status, and operational drill-down. The residents directory is the admin's lens on a `customers` row with active or historical `bookings`.

**SSOT:** `residentAdmin.ts`, `residentFinancialEngine.ts`, `listResidentsForAdmin.ts`

---

## Related features

- [[Residents]] directory — `/admin/residents`, `/admin/residents/[customerId]`
- Resident hub (customer) — `/account/profile?section=resident`
- Express collection / walk-in — admin-initiated payments on profile
- [[KYC]] status gate before bed assignment
- [[Bed Assignment]] link from resident profile
- [[Vacating]] status and lifecycle timeline
- [[Deposits]] wallet view per booking
- [[Billing]] outstanding rent/electricity (via financial engine)

See [[features#Residents directory]] and [[features#Resident hub]].

---

## Related workflows

| Workflow | Step |
|----------|------|
| [[WORKFLOWS#Resident Onboarding]] | Booking → KYC → assign bed → active stay |
| [[WORKFLOWS#KYC Approval]] | Unlock assign-bed CTA |
| [[WORKFLOWS#Bed Assignment]] | From profile or bed map |
| [[WORKFLOWS#Billing]] | Monthly rent + electricity display |
| [[WORKFLOWS#Deposit Collection]] | Wallet balance on profile |
| [[WORKFLOWS#Vacating]] | Notice status, checkout progress |
| [[WORKFLOWS#Refund Processing]] | After vacate date + approval |

---

## Related routes

| Route | Role |
|-------|------|
| `/admin/residents` | Searchable tenant list |
| `/admin/residents/[customerId]` | Per-resident command center |
| `/account/profile?section=resident` | Customer resident hub |
| `/account/resident/history/[bookingId]` | Payment history |
| `/admin/bookings/[bookingId]` | Booking detail (linked from profile) |

Canonical list: [[ROUTES#Residents]] · [[ROUTES#Account hub]]

---

## Related database entities

| Table | Role |
|-------|------|
| `customers` | Identity, `kyc_status`, `residency_status` |
| `bookings` | Commercial stay contract, pricing snapshot |
| `bed_reservations` | Occupancy `stay_range` |
| `rent_invoices`, `electricity_invoices` | Billing |
| `deposit_ledger` | Wallet entries |
| `vacating_requests` | Move-out notice |
| `checkout_settlements` | Refund workflow |
| `financial_invoices` | Unified registry mirror |
| `payments` | Razorpay + manual proof |

See [[DATABASE#People & auth]] · [[DATABASE#Bookings & occupancy]]

---

## Related decisions

- [[DECISIONS#residentFinancialEngine as money SSOT]] — all money on profile from engine
- [[DECISIONS#Operations as action hub]] — primary actions not duplicated on profile
- [[DECISIONS#Split vacate request from deposit refund]] — vacate vs refund steps
- [[DECISIONS#Pricing snapshot immutability]] — historical rates frozen
- [[DECISIONS#Bed assignment SSOT alignment]] — list vs bed map consistency

---

## Related hubs

[[KYC]] · [[Bookings]] · [[Bed Assignment]] · [[Beds]] · [[Billing]] · [[Deposits]] · [[Vacating]] · [[Operations]]
