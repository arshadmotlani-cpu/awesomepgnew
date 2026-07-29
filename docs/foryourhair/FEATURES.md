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

## Service catalog (Service Master)

Salon-first **create/edit** form: name, category, duration, selling price, cost price (required, internal), status, description. **GST is fixed at 18%** (not per service; future changes via Settings). **Staff** is chosen at appointment / Quick Sale checkout—not on the service record. **Commission** and **consumables** are not configured here (commission rules and inventory mapping are future modules; DB columns and seed data remain for billing tests).

| Topic | Behavior |
|-------|----------|
| **Categories** | Six salon groups only: Hair, Skin, Makeup, Nails, Academy, Digital Production (`0015` migration remaps legacy names). |
| **Service codes** | Auto-generated internally (`SVC-####`); not shown in UI, search, or Quick Sale tiles. |
| **GST** | **18%** applied automatically on save (schema default `1800` bps). |
| **Cost price** | Required on form; internal margin / BI only; not on POS or invoices (RBAC later). |
| **Sort order** | Services list and Quick Sale catalog sort by category order, then name (no per-service display order in UI). |
