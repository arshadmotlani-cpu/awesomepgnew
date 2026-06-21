# Deposits

> Domain hub — security deposit wallet, collection, deductions, and refund ledger.

Cross-links: [[START_HERE]] · [[FEATURES#Deposits]] · [[WORKFLOWS#Deposit Collection]]

---

## Purpose

Track **security deposits** per booking: required amount, collection at checkout or offline, partial collection, vacating notice deductions, and final refund via checkout settlement. The deposit wallet is auditable through `deposit_ledger` entries.

**SSOT:** `deposits.ts`, `depositOperations.ts`, `getDepositSummaryForBooking()`

---

## Related features

- [[Deposits]] admin — `/admin/deposits`, `/admin/deposits/[bookingId]`
- Deposit at public booking checkout
- Offline collection — `/admin/deposits/add`
- Vacating penalty deduction (5-day rent) snapshotted on notice
- Refund via [[Checkout Settlements]]
- Express collection on [[Residents]] profile

See [[FEATURES#Deposits]]

---

## Related workflows

| Workflow | Steps |
|----------|-------|
| [[WORKFLOWS#Deposit Collection]] | Required → collect → ledger → refundable balance |
| [[WORKFLOWS#Vacating]] | Short-notice deduction snapshotted |
| [[WORKFLOWS#Refund Processing]] | Settlement → ledger refund entry → payout |

---

## Related routes

| Route | Role |
|-------|------|
| `/admin/deposits` | All deposit wallets |
| `/admin/deposits/[bookingId]` | Per-booking ledger |
| `/admin/deposits/add` | Offline collection |
| `/admin/checkout-settlements/[id]` | Refund approval |
| `/booking/[bookingCode]/pay` | Initial deposit at booking |

See [[ROUTES#Deposits & checkout]]

---

## Related database entities

| Table / field | Role |
|---------------|------|
| `bookings.deposit_paise` | Required deposit |
| `bookings.deposit_due_paise` | Outstanding |
| `bookings.deposit_collection_status` | pending / full / partial / overdue / waived |
| `deposit_ledger` | collected, deducted, refunded entries |
| `vacating_requests` | Penalty amount snapshot |
| `checkout_settlements` | Final refund amount and status |
| `payments` | Razorpay deposit capture |

See [[DATABASE#Deposits — Deposits]]

---

## Related decisions

- [[DECISIONS#Vacating: 14-day notice + fixed 5-day penalty]]
- [[DECISIONS#Split vacate request from deposit refund]]
- [[DECISIONS#Checkout settlements as refund SSOT]]
- [[DECISIONS#Pricing snapshot immutability]]
- [[DECISIONS#residentFinancialEngine as money SSOT]]

---

## Related hubs

[[Residents]] · [[Bookings]] · [[Vacating]] · [[Checkout Settlements]] · [[Billing]] · [[Operations]]
