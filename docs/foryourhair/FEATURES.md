# For Your Hair — Features

## Quick Sale (walk-in POS)

Single billing workflow for walk-in customers at `/quick-sale` (**Express Sale** via 9-dot quick actions).

| Capability | Status |
|------------|--------|
| **Advance Payment** (wallet credit, no invoice) | Live at `/advance-payment` via 9-dot launcher |
| Customer search / quick add (`customer_code`) | Live |
| Catalog tabs: services, products, packages, memberships | Live |
| Line discounts (% ↔ ₹) | Live |
| Invoice discount, wallet, tip, round-off | Live |
| Multi **Serviced by** (equal split in UI) | Live |
| **Sold by** on retail / package / membership lines | Live |
| Split payments (cash, UPI, card, bank, wallet) | Live |
| **Hold bill** (multiple drafts, resume cart + attribution + payment draft) | Live (`0014`) |
| Membership / package **sale** on pay (activation) | Live |
| Product **stock consumption** on pay | **Next phase** (inventory) |
| Package / membership **redemption** at checkout | **Next phase** |

Invoices use `source = quick_sale`. Held bills use `status = draft` and `HOLD-*` numbers until checkout assigns a real invoice number.

## Sales attribution (SSOT)

Table: `fyh_invoice_line_attributions`.

- Roles: `serviced_by` (services), `sold_by` (product / package / membership).
- `share_bps` stores split weights (10_000 = 100%). UI uses equal split; API accepts custom `shareBps` for future 70/30, 60/40, etc.
- `attributed_net_paise` is the performance fact for reports.
- Written at Quick Sale create and on appointment pay (fallback sync from line `staff_id`).

Staff performance and top-service reports read attributions on paid invoices, not raw line totals.

## Commission architecture

| Layer | Role |
|-------|------|
| Attributions | Sales / performance SSOT |
| `fyh_commission_rules` | Future rule definitions (scopes, tiers, roles, effective dates) — **not evaluated in billing** |
| `applyLegacyServiceCommission` | Today’s service commission accrual (dual-write until engine) |
| `commissionEngine.ts` | No-op scaffold |

Rule scopes (schema-ready): service, product, package, membership, gift_card, retail, course, bridal, global.

## Reports

Collapsible **Reports** nav: revenue periods, staff metrics (attribution-driven), placeholders for inventory / finance / customer analytics.

## Next phases only

1. **Inventory consumption** — deduct retail + service consumables on Quick Sale pay (appointment path already consumes).
2. **Package redemption** — apply session credit at checkout.
3. **Membership consumption** — discount / benefit rules at line level beyond today’s membership discount preview.

No Quick Sale architecture changes required before those phases.
