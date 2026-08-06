# ADR-FYH-002: Purchase Brain & Purchase Engine

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-08-06 |
| **Owner** | FYH Salon / Ecosystem procurement |
| **Consumers** | FYH Salon Engine UI, Purchase Brain, Vendor Ledger (Phase 3), Inventory Brain (Phase 4), Owner OS (future) |
| **Cross-links** | [[FYH_PURCHASE_ROADMAP]] · [[ECOSYSTEM_V2]] · [[ECOSYSTEM_V2_BRAIN_REGISTRY]] · [[ECOSYSTEM_V2_EVENTS]] · ADR-ECO-001 |

---

## Context

ERP foundation (`0029_erp_foundation`) delivered brands, vendors, products, expenses, and stock movement ledger. Legacy PO/GRN tables (`fyh_purchase_orders`, `fyh_goods_receipts`) exist but must not be extended.

Procurement needs a **single write path** that ties vendors, inventory inward, expenses, and future Owner OS finance together.

---

## Decision

### 1. Engine vs Brain split

| Layer | Module | Writes | Reads |
|-------|--------|--------|-------|
| **Engine** | Purchase Engine (`src/hair/services/purchaseEngine.ts`) | `createPurchase` — atomic transaction | Vendor/product validation only |
| **Brain** | Purchase Brain (`src/hair/services/purchaseBrain.ts`) | None | Purchases, payables, outstanding projections |
| **Engine shell** | FYH Salon UI (`/purchases`) | Server actions delegate to Purchase Engine | Purchase Brain for list/detail |

Never put outstanding-balance math or purchase explain logic in UI or server actions.

### 2. `createPurchase` atomic side effects

Within one DB transaction, recording a purchase MUST:

1. Insert `fyh_purchases` + `fyh_purchase_lines`
2. Insert `fyh_vendor_payables` — **one row per purchase invoice** (`purchase_id` UNIQUE). `balance_paise` is the remaining balance on that invoice only. Vendor outstanding = `SUM(balance_paise)` at query time (never a stored running vendor total).
3. For each line: `applyMovement(type=purchase, reference_type=purchase)` + weighted-average cost update
4. Insert `fyh_expenses` row (`category=inventory_purchase`, `purchase_id` FK)
5. Emit stub domain event `salon.purchase.recorded` (typed function; full event plane later)

**Hard rule:** After this ADR ships, no other code path may create `movement_type=purchase` stock inward.

### 3. New tables (migration `0030_purchase_brain`)

```
fyh_purchases
  id, vendor_id, purchase_number, vendor_invoice_ref, purchase_date,
  total_paise, notes, status, staff_name, staff_employee_id, created_at, updated_at

fyh_purchase_lines
  id, purchase_id, product_id, quantity, unit_cost_paise, line_total_paise

fyh_vendor_payables
  id, vendor_id, purchase_id (UNIQUE — one payable per invoice), amount_paise, balance_paise, status
  Vendor outstanding = SUM(balance_paise) WHERE vendor_id = ? — computed, not stored, created_at, updated_at
```

Extend `fyh_expenses` with nullable `purchase_id` FK → `fyh_purchases`.

Reuse `fyh_stock_movements` with `reference_type='purchase'`, `reference_id=purchase.id`.

### 4. Legacy sunset

| Asset | Action |
|-------|--------|
| `fyh_purchase_orders` / GRN tables | **DEPRECATED** — no new features |
| `src/hair/services/purchases.ts` (PO/GRN) | **DEPRECATED** — do not call from new UI |
| `/inventory/purchases/*` | Hidden; redirect or remove in Phase 7 |
| Product form stock qty edit | Remains until Inventory Brain (Phase 4) |

### 5. Permissions & nav

- `page:purchases` maps from `inventory.view` / `inventory.edit` (same gate as vendors)
- Root nav: **Purchases** between Vendors and Expenses

### 6. Events (stub)

```typescript
// salon.purchase.recorded
{
  engineId: 'fyh_salon',
  purchaseId: string,
  vendorId: string,
  totalPaise: number,
  purchaseDate: string,
}
```

Owner OS / Finance Brain subscribe when event plane v1 lands.

---

## Consequences

- Vendor Ledger (Phase 3) reads payables from Purchase Brain — does not duplicate purchase writes.
- General Expenses UI remains for non-purchase operating costs only.
- Purchase-linked expenses are system-generated; users must not manually duplicate them.
- Stability Phase: regression test proves one `createPurchase` creates movement + payable + expense.

---

## Non-goals (this ADR)

- Partial payments / payment allocations (Phase 5)
- Purchase returns (Phase 6)
- Purchase orders (Phase 7)
- Vendor Ledger UI (Phase 3)
- Inventory Brain stock projection (Phase 4)
- Owner OS net-worth wiring (event stub only)

---

## Follow-ons

See [[FYH_PURCHASE_ROADMAP]] Phases 3–7.
