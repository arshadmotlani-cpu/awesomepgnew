# Quick Sale — Billing Engine Architecture (Approved Foundation)

**Status:** Implemented (Phases 0–4 core) · Migration `0016_billing_foundation`  
**Scope:** Salon POS (`/quick-sale`) and shared checkout pipeline used by hold bills, appointment checkout, and reports.

This document is the SSOT for architectural decisions. UX redesign specs reference this foundation — do not implement UI until Phase 0 exit criteria pass.

---

## Core invariant

Every downstream value derives from one path:

```
Customer → Basket → BasketEngine → PricedBasket → Financial Ledger → Invoice → Staff Performance → Reports
```

No duplicated money calculations in UI, actions, or parallel service functions.

---

## Domain model

### BillableItem (unified catalog read model)

Renamed from `CatalogItem` — generic enough for any billable entity (services, products, packages, memberships, and future types).

```ts
type BillableItemType = 'service' | 'product' | 'package' | 'membership'; // extensible

type StaffMode = 'SERVICE' | 'SALE';

type BillableItem = {
  id: string;
  type: BillableItemType;
  name: string;
  code: string | null;           // service code, SKU, barcode
  sellingPricePaise: number;     // GST-inclusive customer price
  gstBps: number;                // default 1800 from fyh_settings
  category: string | null;
  staffMode: StaffMode;
  active: boolean;
};
```

**Staff mode mapping (initial):**

| type | staffMode |
|------|-----------|
| service | SERVICE |
| product, package, membership | SALE |

**Adapter:** `BillableCatalogAdapter` reads four existing DB tables; billing engine never branches on raw table names.

UI category tabs (Services / Products / Packages / Memberships) are **filters on `type`**, not separate logic paths.

---

### Basket (single source of truth)

```ts
type StaffAllocation = {
  staffId: string;
  shareBps: number;              // persisted intent; sum ≤ 10_000 per line
};

type BasketLine = {
  lineId: string;
  billableRef: { id: string; type: BillableItemType };

  // Historical snapshot at add-to-basket time (§ Invoice snapshots)
  snapshot: {
    name: string;
    code: string | null;
    unitSellingPricePaise: number;
    gstBps: number;
    staffMode: StaffMode;
    category: string | null;
  };

  quantity: number;
  overridePricePaise: number | null;  // ONLY optional monetary override (§ Pricing)
  staff: StaffAllocation[];

  // Never stored as editable — derived by BasketEngine for display
  // discountPaise, discountBps, basePaise, gstPaise, finalLinePaise
};

type PaymentEntry = {
  id: string;
  method: 'cash' | 'upi' | 'card';
  amountPaise: number;
};

type Basket = {
  customerId: string;
  lines: BasketLine[];
  payments: PaymentEntry[];
  flags: {
    markDue?: boolean;
    markFullDue?: boolean;
    creditOverpayAsAdvance?: boolean;
  };
};
```

**Hold bills** persist a full basket snapshot (lines + payments + flags), not scattered `posDraft` payment strings.

---

### Pricing rules

#### overridePrice only

Receptionists think in customer prices. The basket stores:

- `snapshot.unitSellingPricePaise` — frozen catalog price at add time
- `overridePricePaise` — optional line-level override (null = use catalog × qty)

**Derived (never editable, never dual-persisted):**

```
grossPaise     = (overridePricePaise ?? unitSellingPricePaise × quantity)
finalLinePaise = grossPaise   // after any line-level adjustment logic
discountPaise  = (unitSellingPricePaise × quantity) − finalLinePaise  // when override set
discountBps    = derived from gross and discount
```

GST is **always inclusive** at 18% (or item `gstBps`):

```
finalLinePaise (inclusive)
  → basePaise = round(final × 10_000 / (10_000 + gstBps))
  → gstPaise  = finalLinePaise − basePaise
```

BasketEngine is the **only** module that performs these derivations.

---

### Staff allocations — percentage-based

Do **not** equal-split at persist time only. Store explicit `shareBps` per staff on each line.

- **SERVICE mode:** multiple staff; UI defaults new staff to equal remaining share; receptionist can adjust percentages.
- **SALE mode:** exactly one staff at 10_000 bps (100%).

Validation: `sum(shareBps) === 10_000` per line before checkout.

Attribution rows written to `fyh_invoice_line_attributions` from `PricedBasket.attributions` — never shown on customer invoices.

---

### PricedBasket (engine output)

```ts
type PricedBasket = {
  lines: PricedLine[];           // snapshot + derived base/gst/discount/final
  totals: {
    subtotalBasePaise: number;
    taxPaise: number;
    discountPaise: number;
    grandTotalPaise: number;
  };
  attributions: AttributionPlan;
  ledgerEntries: FinancialLedgerEntry[];  // payments + receivable + advance
};
```

---

## Financial Ledger (unified — replaces separate Wallet + Receivable)

One append-only ledger for all customer money movements. No direct edits to `walletBalancePaise` or inferred-only due balances.

```ts
type LedgerAccount = 'customer_wallet' | 'accounts_receivable' | 'cash' | 'upi' | 'card';

type FinancialLedgerEntry = {
  id: string;
  customerId: string;
  invoiceId: string | null;
  account: LedgerAccount;
  direction: 'debit' | 'credit';
  amountPaise: number;
  method: 'cash' | 'upi' | 'card' | null;   // for tender movements
  kind:
    | 'invoice_charge'      // AR debit — bill created
    | 'payment_received'    // tender credit → reduces AR
    | 'advance_credit'      // overpay → wallet credit
    | 'wallet_redemption'   // wallet debit applied to invoice
    | 'receivable_open'     // explicit due (partial / full)
    | 'receivable_settled'; // AR cleared
  reference: string | null;
  createdAt: Date;
};
```

**Balances are derived:**

| Balance | Formula |
|---------|---------|
| Wallet | credits (`advance_credit`) − debits (`wallet_redemption`) |
| Outstanding (AR) | open receivable entries − settlements |
| Invoice paid | sum of `payment_received` for invoice |

`walletBalancePaise` on `fyh_customers` becomes a **materialized cache**, updated only inside ledger transactions.

**Checkout examples:**

| Scenario | Ledger |
|----------|--------|
| Full pay ₹10k Cash | `invoice_charge` +10k AR · `payment_received` −10k AR · tender +10k cash |
| Split ₹6k UPI + ₹4k Cash | two `payment_received` rows |
| Partial ₹8k on ₹10k | charge +10k · pay −8k · `receivable_open` +2k |
| Full due | charge +10k · `receivable_open` +10k |
| ₹11k cash on ₹10k bill + advance | charge +10k · pay −10k · `advance_credit` +1k wallet |

Payment UI: dynamic ledger rows (amount + method + Add Payment) — not Payment 1 / 2 / 3.

Supported tender methods in Quick Sale POS: **Cash, UPI, Card** only.

---

## Invoice line snapshots

Every persisted invoice line is a **historical snapshot**. Never a live FK join to current catalog for customer-facing amounts or names.

At checkout, `PricedBasket` lines map to `fyh_invoice_lines` with frozen:

- `nameSnapshot`
- `unitPricePaise` (inclusive selling unit at time of sale)
- `gstBps`, `taxPaise`, `discountPaise`, `lineTotalPaise`
- source refs (`serviceId`, etc.) for reporting joins only — **display always uses snapshot columns**

Catalog price changes after sale do not affect past invoices.

---

## Customer vs staff documents

| Template | Audience | Must never include |
|----------|----------|-------------------|
| Customer invoice | Print, WhatsApp, PDF | Staff, Service By, Sold By, commission, attribution, split %, internal IDs |
| Staff invoice | `/billing/[id]` admin view | May include status, receivable, attribution (read-only) |

Remove stylist name from customer print HTML.

---

## Communication settings (extensible)

Settings hold salon-configurable templates — no hardcoded review links:

```ts
type CommunicationSettings = {
  googleReviewUrl: string | null;
  whatsappInvoiceTemplate: string;   // {{name}}, {{amount}}, {{link}}
  reviewRequestTemplate: string;
  // future: dueReminderTemplate, birthdayTemplate, …
};
```

Leverage `fyh_notification_templates` + outbox for delivery.

---

## POS UX decisions (post-foundation)

| Feature | Placement |
|---------|-----------|
| Hold bill | Secondary menu (⋮ / More) — not primary |
| Exact phone match | Auto-select customer, skip extra click |
| Category tabs | Segmented control; search scoped to active tab |
| Success dialog | Print, PDF, WhatsApp, Open Invoice, Google Review, Done |

---

## Module layout (target)

```
src/hair/domain/
  catalog/
    types.ts              BillableItem, StaffMode
    adapter.ts            DB → BillableItem[]
  basket/
    types.ts              Basket, BasketLine, StaffAllocation
    engine.ts             priceBasket() — GST, discounts, totals
    attribution.ts        buildAttributionPlan()
  ledger/
    types.ts              FinancialLedgerEntry
    service.ts            post(), balance(), reconcile cache
  checkout/
    pipeline.ts           checkoutFromBasket() — single entry

src/hair/services/
  invoices.ts             → InvoiceRepository + side effects (slim)
  quickSaleHold.ts        → basket snapshot persist/restore
```

---

## Phased implementation

### Phase 0 — Foundation (blocking)

1. Domain types: `BillableItem`, `Basket`, `StaffAllocation`, `PricedBasket`
2. `BasketEngine` — inclusive GST, overridePrice derivations
3. `BillableCatalogAdapter` + staffMode
4. `checkoutFromBasket()` — replace duplicated hold/create/release paths
5. Unit/property tests: basket → priced → invoice totals match

### Phase 1 — Financial Ledger

6. `fyh_financial_ledger` migration (or equivalent normalized tables)
7. `LedgerService` — all wallet/AR/advance/payment through ledger
8. Deprecate direct `walletBalancePaise` writes
9. Migrate advance payment page to ledger

### Phase 2 — Checkout rules + documents

10. Partial pay, Mark as Due, Mark Full Due, advance on overpay
11. Customer vs staff invoice templates
12. Line snapshot enforcement on persist

### Phase 3 — POS redesign

13. Basket table UI, search-first add, split payment ledger UI
14. Auto-select exact phone, hold in ⋮ menu, success dialog + comms settings

### Phase 4 — Hardening

15. Quick Sale inventory side effects
16. Package redemption wiring
17. Commission reads attributions only
18. Reporting from ledger + snapshots

---

## Explicit non-goals in foundation

- Copying SpalonSoft UI
- Dual editable discount fields (% and ₹)
- Direct wallet balance mutation outside ledger
- `if (kind === 'service')` for staff UX (use `staffMode`)
- Live catalog joins on customer invoice display
- Bank / gift card in Quick Sale POS tender UI

---

## Related

- [QUICK_SALE.md](./QUICK_SALE.md) — current code map (pre-refactor)
- [FEATURES.md](./FEATURES.md) · [WORKFLOWS.md](./WORKFLOWS.md)
