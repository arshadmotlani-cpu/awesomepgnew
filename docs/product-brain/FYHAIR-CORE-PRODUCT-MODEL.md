# Salon Software — Core Product Model

> **Terminology:** [`TERMINOLOGY.md`](./TERMINOLOGY.md)  
> Workshop: **KNOWN** / **INFERRED** / **TO BE DEFINED**. Interactive explorer: `/system-map` (Hair host, noindex).


## Interactive Core Product Workshop (KNOWN)

Open **Salon Software System Map** → **Core Product** tab at `/system-map` (Hair host).

| View | Purpose |
|------|---------|
| Core workflow | Spine: customer → appointment/walk-in → basket → invoice → business records |
| 25 areas | Product map with CURRENT FYHAIR vs TARGET badges |
| Business day | Opening → closing stages |
| Roles | Owner, manager, receptionist, cashier, stylist, employee (audit nav/RBAC) |
| Configuration | What salons can customize — levels from audit only |
| Boundaries | Core vs platform vs advanced (discussion, not final tiers) |
| 100+ salons | Target org stack — **not production guarantee** |
| Product gaps | ISS-backed CURRENT vs TARGET |
| Decisions | TBD-01…TBD-12 — **DECISION REQUIRED** |

Data module: `src/hair/system-map/coreProduct/data.ts` (evidence-tagged; no invented requirements).

## Terminology

| | |
|---|---|
| **COMPANY** | For Your Technologies |
| **PRODUCT** | Salon Software |
| **REFERENCE CUSTOMER / SALON** | FYHAIR (For Your Hair) — not the product name |

**FYHAIR existing implementation** = current Hair-host app + Hair DB used by the FYHAIR organization.  
**Salon Software target SaaS product** = same codebase evolved to serve many salon **organizations** with isolation.

## Relationship (corrected)

```text
For Your Technologies
    ↓
Salon Software (product)
    ├── Platform Administration (orgs, plans, subscriptions — Platform DB)
    └── Salon Application runtime (Hair DB — fyh_* + wf_*)
            └── Organizations / salons (FYHAIR = reference; Salon B/C = future tenants)
```

Legacy shorthand in audits may still say “FYTECH” for the monorepo ecosystem label.

## 22 core areas

Organization, locations, users, roles, permissions, customers, staff, services, products, appointments, billing, payments, inventory, vendors, expenses, memberships, packages, loyalty, reports, notifications, settings, SaaS subscription — see FYHAIR-COMPLETE-AUDIT Parts 2–3 for routes, tables, and status.

## Configuration matrix (salon scale)

Branding, logo, salon name, locations, hours, staff, roles, permissions, services/prices, products/prices, GST/tax, appointment/cancellation rules, payment methods, invoice/receipt settings, inventory rules, vendors, memberships, packages, loyalty, expenses, reports, notifications, comms, customer/custom fields, numbering, currency, timezone, language, subscription limits — cells without audit evidence remain **TO BE DEFINED**.

## 100+ salon SaaS readiness (evidence)

| Concern | Rating |
|---------|--------|
| Tenant isolation | PARTIAL — ISS-01 |
| Public invoice | UNSAFE — ISS-02 |
| Catalog scoping | MISSING — ISS-03 |
| Service layer guards | PARTIAL — ISS-04 |
| Dual RBAC | PARTIAL — ISS-05 |
| Duplicate purchase/vendor UI | OPEN — ISS-06 |
| Notification delivery | MISSING — ISS-07 |
| Hair cron jobs | MISSING — ISS-16 |
| Schema/migrations prod | UNKNOWN — ISS-19/20 |

## First owner decisions

1. Tenant isolation contract. 2. Public invoice policy. 3. Route consolidation (purchases/vendors). 4. RBAC end state. 5. Checkout completeness (gift card, packages, retail). 6. Notifications. 7. Config boundaries. 8. Production DB introspection.

## Discrepancies

System map flags parse anomalies. Feature rows F-01…F-65 merged from audit Part 3 at runtime when graph stubs lack names.

---

## Forensic workflow audit (2026-10-04)

See [`FYHAIR-REAL-WORKFLOW-AUDIT.md`](./FYHAIR-REAL-WORKFLOW-AUDIT.md) and [`FYHAIR-REAL-WORKFLOW-GRAPH.mermaid`](./FYHAIR-REAL-WORKFLOW-GRAPH.mermaid).

**Proven corrections vs prior docs:**

- Quick Sale **retail + consumable inventory** deduction on paid checkout runs via `applyPaidSideEffects` → `applyInventorySideEffects` for `source=quick_sale` (verify against FEATURES.md “next phase” — code wins).
- **Hold bill create** button lives only in unused `QuickSaleCheckoutColumn`; compact `QuickSaleShell` exposes **resume held bills** on customer step but not hold submit in UI (tests confirm column not mounted).
- Express Sale entry: **9-dot Express Sale** primary; nav Quick Sale link hidden.

### Workflow facts proven in source (2026-10-04)

Authority: [`FYHAIR-REAL-WORKFLOW-AUDIT.md`](./FYHAIR-REAL-WORKFLOW-AUDIT.md).

- Canonical bill write is `checkoutFromBasket`. Display status is `summarizeInvoiceSettlement` and is not the writer.
- Appointment billing is **Raise Sale → Express Sale**, not a second checkout implementation.
- Membership discount is automatic (`discount_bps` on the first active membership). Package use on the bill is the **Available Services** prepaid-line flow, plus a legacy auto session discount if no prepaid line is present.
- Inventory mutation SSOT remains `applyMovement`. Express Sale product lines and service consumables move stock only when the invoice is fully paid.
- `fyh_customers.reward_points` is shown on the profile and loyalty report and is not updated by checkout.

### Continued forensic pass (2026-10-04, appended)

- Voiding a bill changes active wallet and receivable by **ignoring** that invoice’s ledger rows (`excludeVoidInvoiceLedger`). It does not post the unused `planInvoiceCancellationLedger` drafts and does not reverse stock.
- Package credits and membership rows are created only inside `applyPaidSideEffects` (full payment or ₹0). Cancelling the invoice does not remove them.
- Commission rows are `pending` until `/loyalty` marks that staff’s pending rows `paid`. They are not copied into workforce salary.

### Revenue and expense rules (2026-10-06)

- Revenue dashboard sales are issued invoice lines (service, package, product, membership) scaled to the invoice grand total. Gift cards are excluded.
- Actual collection is cash, card, UPI/online, and other real tenders minus credit notes. Advances and membership credit stay separate.
- General expenses use six categories (stock purchase, foods & beverage, general, maintenance, bill, other), paid by salon/staff/owner/other, and tender cash/card/upi. Salary remains payroll.
