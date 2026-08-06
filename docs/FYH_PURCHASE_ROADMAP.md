# FYH Salon — Purchase & Procurement Roadmap

> **Supersedes** the pre-2026-08 ERP “Phase 2 = Vendor Ledger” plan.  
> Foundation frozen at commit `3430550a` (migration `0029_erp_foundation`).  
> Constitution: [[ECOSYSTEM_V2]] · ADR: [[ADR-FYH-002-purchase-brain]] · Registry: [[ECOSYSTEM_V2_BRAIN_REGISTRY]]

---

## Foundation (complete — do not extend legacy PO/GRN)

| Asset | Role |
|-------|------|
| `fyh_brands` | Vendor-managed brand catalog → product dropdown |
| `fyh_vendors` | Vendor master data (top-level nav) |
| `fyh_products` | Catalog with required `brand_id` |
| `fyh_expenses` | **Non-purchase** operating expenses (utilities, rent, etc.) |
| `fyh_floor_issues` | On-floor stock foundation |
| `fyh_stock_movements` | Append-only ledger — future Inventory Brain SSOT |

### Deprecated (sunset when Purchase Brain is live)

Do **not** extend these paths or tables:

| Legacy | Location |
|--------|----------|
| Purchase orders | `fyh_purchase_orders`, `fyh_purchase_order_lines` |
| Goods receipts | `fyh_goods_receipts`, `fyh_goods_receipt_lines` |
| UI routes | `/inventory/purchases/*`, `/inventory/adjustments/*`, `/inventory/transfers/*` |
| Service | `src/hair/services/purchases.ts` (PO/GRN — replaced by Purchase Engine) |

---

## Phase 2 — Purchase Brain (current milestone)

**One action — record a purchase — atomically creates:**

1. Purchase record (`fyh_purchases` + lines)
2. Vendor payable (`fyh_vendor_payables`) — **one row per purchase invoice** (`purchase_id` UNIQUE). Vendor outstanding = `SUM(balance_paise)` at query time, never a stored running vendor total.
3. Stock inward (`fyh_stock_movements`, `movement_type = purchase`)
4. Expense row (`fyh_expenses`, `category = inventory_purchase`, linked to purchase)
5. Domain event stub (`salon.purchase.recorded` — Owner OS hook)

**Hard rule:** After Phase 2 ships, **only Purchase Engine** creates purchase-type stock inward (sale/consumption engines follow in Phase 4).

| Layer | Module | Responsibility |
|-------|--------|----------------|
| Engine | Purchase Engine | `createPurchase`, lines, payables; calls StockService |
| Brain | Purchase Brain | Outstanding projections, purchase explain, vendor purchase history |
| Engine shell | FYH Salon UI | `/purchases` routes, forms, server actions |

Nav: new root **Purchases** between Vendors and Expenses.

---

## Phase 3 — Vendor Ledger Brain (FROZEN 2026-08-06)

Vendor detail (`/vendors/[id]`) is a **Resident-style financial account**:

- Dashboard: outstanding, advance, purchases, payments, returns, avg payment delay
- Invoice ledger (one payable per purchase)
- Payment history with numbers, attachments, reversal (never delete)
- Bank-style statement PDF (custom date range, opening/closing balance)
- Activity timeline (purchases, payments, returns, edits, notes)
- Purchase edit with audit trail; invoice attachment upload

**Architecture frozen:** invoice-based payables only; `SUM(balance_paise)` for vendor outstanding.

Migration: `0031_vendor_ledger`, `0032_vendor_brain_freeze`.

---

## Phase 4 — Inventory Brain

- Stock = projection from `SUM(fyh_stock_movements.quantity_delta)`
- Movement types: `purchase`, `sale`, `consumption`, `return`, `adjustment`
- Retire manual stock edits on product form; adjustments become explicit movements

---

## Phase 5 — Payment allocations

- Partial payments, advances, multi-method splits
- Mirror PG payment allocation patterns
- Applies to vendor payables, not raw expense rows

---

## Phase 6 — Returns

- Return **from purchase invoice**, not inventory screen
- Negative payable + negative stock movement + link to original purchase

---

## Phase 7 — Purchase Orders

- Only after live purchases exist
- PO is optional precursor to purchase record — not a parallel stock path

---

## Explicitly out of scope until ADR signed

- Vendor Ledger UI / outstanding dashboards (Phase 3)
- Partial payments / AP workflows (Phase 5)
- PO workflow extension (Phase 7)
- Manual inventory inward outside purchases
- Owner OS net-worth wiring (event stub only in Phase 2)

---

## Execution order

1. `FYH_PURCHASE_ROADMAP.md` (this file) + registry cross-link
2. Nav: Vendors top-level; Inventory → Stock · On Floor · Movements
3. `ADR-FYH-002-purchase-brain.md`
4. Purchase Engine + `/purchases` + migration `0030_purchase_brain.sql` + tests

Deploy: `npm run hair:db:migrate` after each migration PR.
