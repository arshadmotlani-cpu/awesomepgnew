# Checkout Settlements

> Domain hub — move-out refund workflow: electricity, deductions, deposit payout.

Cross-links: [[START_HERE]] · [[Vacating]] · [[WORKFLOWS#Refund Processing]]

---

## Purpose

**Single SSOT for move-out refunds** after vacating approval. Admin reviews electricity (meter / average / manual), notice deductions, approves refund amount, and records UPI payout.

**SSOT:** `checkoutSettlement.ts`, `checkout_settlements` table

---

## Related features

- Settlement queue — `/admin/checkout-settlements`, `/admin/checkout-settlements/[id]`
- Created automatically on [[Vacating]] approve
- Resident meter + UPI submission (gated by vacate date)
- Status machine: `awaiting_resident_details` → … → `refund_paid` / `completed`

See [[FEATURES#Checkout Settlements]]

---

## Related workflows

[[WORKFLOWS#Refund Processing]] · [[WORKFLOWS#Vacating]] (approve creates settlement)

---

## Related routes

| Route | Role |
|-------|------|
| `/admin/checkout-settlements` | Queue |
| `/admin/checkout-settlements/[id]` | Review + payout |
| `/admin/operations` | Deep link when approved |

See [[ROUTES#Deposits & checkout]]

---

## Related database entities

`checkout_settlements`, `vacating_requests`, `deposit_ledger`, `electricity_invoices`, `bookings`

See [[DATABASE#Move-out — Vacating]]

---

## Related decisions

- [[DECISIONS#Checkout settlements as refund SSOT]]
- [[DECISIONS#Split vacate request from deposit refund]]
- [[DECISIONS#Operations as action hub]]

---

## Related hubs

[[Vacating]] · [[Deposits]] · [[Billing]] · [[Electricity]] · [[Operations]] · [[Residents]]
