# Checkout Pay & complete — production verification checklist

Run after deploy on **5 different bookings** with refundable checkout (non-zero refund, refund already sent = Yes).

For each run, after **Approve & complete checkout**:

| Check | Expected |
|--------|-----------|
| UI | Toast: **Checkout completed successfully.** → redirect `/admin/operations?filter=checkout` |
| UI | No generic “Something went wrong”; button shows **Completing checkout...** while pending |
| Settlement | `checkout_settlements.status` = `completed` (or `refund_paid` if legacy) |
| Refund | `refund_paid_at` / `refund_reference` set when refund &gt; 0 |
| Booking | Vacating finalized; bed available per occupancy rules |
| Operations | Checkout review notification cleared |
| Idempotency | Second click on same settlement (if reachable) must not duplicate ledger/refund rows |
| Ledger | Single checkout idempotency key `checkout:{settlementId}` on deposit settlement |
| Logs | No 500 on `POST` financial / server actions; optional `[debug-b2af77] completeCheckoutSettlementAction:ok` |

Duplicate detection (SQL hints):

- `deposit_settlements` — at most one row per `idempotency_key = 'checkout:' || settlement_id`
- `checkout_settlements` — one terminal transition; no second `approved` audit spam on double-submit
