# Vacating

> Domain hub — move-out notice, approval, checkout-month rent, and handoff to refund settlement.

Cross-links: [[START_HERE]] · [[features#Vacating pipeline]] · [[WORKFLOWS#Vacating]]

---

## Purpose

Manage the **move-out lifecycle**: resident files notice → admin approves → stay shortened (optional) → checkout settlement created → resident submits meter/UPI after vacate date → admin pays refund. Includes 14-day notice policy, 5-day penalty for short notice, and automatic checkout-month rent pro-ration.

**SSOT:** `vacating.ts`, `vacatingCheckoutBilling.ts`, `moveOutPipeline.ts`, `depositRefundEligibility.ts`, `vacatingJourney.ts`

---

## Related features

- [[Vacating]] pipeline UI — `/admin/vacating`
- Resident request vacate — `/account/resident/request-vacating/[bookingId]`
- [[Checkout Settlements]] — refund after approval
- [[Operations]] move-out queue
- Resident timeline (meter/refund locked until vacate date)
- Rich approve dialog + pipeline table (urgency, deposits, timestamps)

See [[features#Vacating pipeline]] · [[features#Request vacate]] · [[features#Deposit refund request]]

---

## Related workflows

| Phase | Flow |
|-------|------|
| Resident submit | Notice date → penalty snapshot → `syncVacatingCheckoutRentBilling` |
| Admin approve | Approve at `/admin/vacating` or [[Operations]] → create settlement |
| Post vacate date | Resident meter + UPI → [[WORKFLOWS#Refund Processing]] |
| Cancel/reject | `restoreRentBillingAfterVacatingCancel` |

Full diagram: [[WORKFLOWS#Vacating]]

---

## Related routes

| Route | Role |
|-------|------|
| `/admin/vacating` | **Canonical** move-out pipeline |
| `/admin/checkout-settlements`, `/admin/checkout-settlements/[id]` | Refund (post-approve) |
| `/admin/operations` | Move-out queue entries |
| `/account/resident/request-vacating/[bookingId]` | Resident notice |
| `/account/profile?section=resident&tab=vacating` | Resident vacating tab |

See [[ROUTES#Operations & Vacating]] · [[ROUTES#Where to act]]

---

## Related database entities

| Table | Role |
|-------|------|
| `vacating_requests` | Notice, status, penalty snapshot |
| `checkout_settlements` | Refund workflow (1:1 with approved vacate) |
| `bed_reservations` | Shortened on approve (future move-outs) |
| `rent_invoices` | Pro-rated checkout month; future cancelled |
| `electricity_invoices` | Final bill at settlement |
| `deposit_ledger` | Deductions and refund entries |
| `bookings` | `expected_checkout_date`, status → completed |

See [[DATABASE#Move-out — Vacating]]

---

## Related decisions

- [[DECISIONS#Vacating: 14-day notice + fixed 5-day penalty]]
- [[DECISIONS#Vacating checkout rent sync]]
- [[DECISIONS#Split vacate request from deposit refund]]
- [[DECISIONS#Checkout settlements as refund SSOT]]
- [[DECISIONS#Operations as action hub]]
- [[DECISIONS#Client Date serialization]] — pipeline UI fix
- [[DECISIONS#Half-open stay ranges]] — pro-ration `activeEnd`

---

## Related hubs

[[Checkout Settlements]] · [[Deposits]] · [[Billing]] · [[Residents]] · [[Operations]] · [[Beds]]

See also [[BUGS#VAC-CRASH-01]] · [[BUGS#VAC-RENT-01]] (resolved)
