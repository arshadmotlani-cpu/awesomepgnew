# FY ERP Hair — Implementation Report

Generated: 2026-07-30 · Integration agent (Phases J–L)

## Completed modules

| Phase | Module | Status |
|-------|--------|--------|
| A | Inventory — StockService, vendors, PO/GRN, adjustments, movements | ✅ Shipped |
| B | Customer account — unified timeline + ledger wallet SSOT | ✅ Shipped |
| C | Financial dashboard — KPIs, daily closing | ✅ Shipped |
| D | Staff performance — per-staff KPIs, trends, commission | ✅ Shipped |
| E | Reporting + CSV/print export | ✅ Shipped |
| F | Appointment → basket checkout via Quick Sale prefill | ✅ Shipped |
| G | Communications — template seed, WhatsApp settings, outbox enqueue | ✅ Shipped (delivery adapters stub) |
| H | Settings — tabbed sections (salon, GST, billing, printer, etc.) | ✅ Shipped |
| I | RBAC — permission keys, nav filter, admin.permissions column | ✅ Shipped (action guards partial) |
| J | Performance — composite indexes, pagination | ✅ Shipped |
| K | Testing — unit + integration coverage, migrationGuard | ✅ Shipped |
| L | Polish — keyboard shortcuts, mobile nav, a11y, empty states | ✅ Shipped |

### Architecture verification

| Rule | Verification |
|------|----------------|
| BasketEngine only pricing | `priceBasket` in `domain/basket/engine.ts`; checkout uses `checkoutFromBasket` |
| StockService only stock mutations | `applyMovement` in `services/stock.ts`; invoices call stock on pay |
| `checkoutFromBasket` only checkout | Quick Sale + appointment paths delegate here |
| Ledger SSOT for money | `postLedgerEntries`, wallet/receivable from `domain/ledger` |

## Commits made

| SHA | Message |
|-----|---------|
| `88f876ef` | feat(fyh): billing foundation — basket engine, ledger, and Quick Sale POS |
| `a830cbbd` | feat(fyh): inventory — stock service, vendors, purchases, GRN, adjustments |
| `4b718079` | feat(fyh): customer account — unified timeline and ledger wallet fix |
| `08c63eff` | feat(fyh): financial dashboard |
| `a2b99d3d` | feat(fyh): staff performance dashboard |
| `0c871187` | feat(fyh): reporting and export |
| `1963f295` | feat(fyh): appointment basket checkout |
| `237f1a4c` | feat(fyh): communications template engine |
| `733fc2f9` | feat(fyh): settings sections |
| `437e77a9` | feat(fyh): RBAC permissions |
| `207986e2` | perf(fyh): indexes and pagination |
| `5df00919` | test(fyh): expanded coverage |
| `4a6918df` | ui(fyh): polish |
| `379dc5b9` | fix(fyh): package redemption in basket checkout |

## Migrations

| Tag | Purpose |
|-----|---------|
| `0016_billing_foundation` | `fyh_financial_ledger`, communication settings |
| `0017_inventory_ops` | Vendors, POs, GRNs, adjustments, inventory_settings |
| `0018_settings_extensions` | Billing/printer/WhatsApp/security JSON + invoice_notes |
| `0019_permissions` | `fyh_admin_users.permissions jsonb` |
| `0020_performance_indexes` | `(customer_id, created_at)`, `(paid_at, status)` composites |

Run: `npm run hair:db:migrate`

## Technical debt

- **RBAC enforcement**: `requirePermission` defined but not wired on all server actions; Security panel is placeholder.
- **Notification delivery**: `processOutboxBatch` is a counter stub — no WhatsApp/SMS adapter.
- **Inventory transfers**: UI placeholder only; batch management UI not built.
- **Report pagination**: Server-side limit/offset exists; most report pages still show first page only (export for full data).
- **priceLineDrafts**: Retained for Quick Sale hold draft math only; not used in paid checkout.
- **Gift card payments**: Blocked at payment layer.

## Future enhancements

- Wire `requirePermission` on inventory, reports, and settings mutations.
- Admin CRUD UI in Security settings.
- XLSX export via dynamic `exceljs` import.
- In-calendar appointment checkout (skip Quick Sale redirect).
- Full notification template editor per kind with variable preview.
- Inventory transfer workflow and batch expiry tracking.

## Test status

Run: `npm run test:hair`

Coverage includes: basket engine, ledger math, stock service, permissions, CSV export, customer timeline, financial dashboard, inventory ops integration, appointment checkout integration, RC visit loop, Quick Sale integration.

Migration guard probes: 0012–0014, 0016–0019 (see `tests/hair/integration/migrationGuard.ts`).
