# Collections

Receivables operations for Awesome PG — queues, calendar, late fees, reminders, receipts, and reports.

Money SSOT remains **residentFinancialEngine + projected invoices**. Collections never invents a second calculator.

Feature flag: `COLLECTIONS_V1` (on by default; set `0` / `false` / `off` to hide Collections surfaces).

---

## Phase 1 (shipped)

- Collections dashboard queues (upcoming / due today / overdue / awaiting / paid today)
- Calendar grid + KPI strip
- `receptionist` role + permissions: `collections:read`, `collections:write`, `collections:remind`, `collections:waive`
- Lifecycle labels over RFE-projected admin rent rows

---

## Phase 2 — Billing events

Migration: **`0129_billing_events`**.

- Append-only `billing_events` log (`src/services/billingEvents.ts`) — best-effort, never fails billing
- Event types: `invoice.upcoming` / `generated` / `overdue` / `paid` / `partial` / `proof_submitted`
- Admin invoice lifecycle panel consumes the log; no second money calculator

---

## Phase 3 — Ops foundation (3.0–3.4)

Migration: **`0130_collections_ops`** (after sibling `0129_billing_events`).

### Schema

| Table | Purpose |
|-------|---------|
| `late_fee_policies` | PG-scoped or global late fee rules (`fixed_per_day` / `percent_of_principal`) |
| `late_fee_waivers` | Audit trail for waived late fees |
| `collection_reminder_policies` | Offset + anchor (`billing_date` / `due_date`) + channel |
| `collection_reminder_templates` | Body text + variables |
| `collection_reminder_deliveries` | Honest delivery log (`pending` / `sent_link` / `skipped` / `failed`) |
| `payment_receipts` | Receipt registry after pay / proof approve |

### Behaviour

- Late fee: `computeLateFee({ policy })` + `projectInvoice` options `lateFeePolicy` / `waiverPaise`; default seed = 1%/day (matches legacy)
- Reminders cron: `/api/cron/collections-reminders` (Vercel 07:00 UTC daily) → wa.me + delivery log
- Receipts: auto-created on rent payment success and rent proof approval (best-effort)
- Advance: `postAdvanceRentCredit` posts to `resident_credit_ledger` with `advance_rent` reason marker
- Reports: `/admin/collections/reports` aggregates from RFE-projected rows
- Bulk: `bulkRemindResidents` / `bulkWaiveLateFees` (permission-gated)

### Gaps / follow-ups

- Hot-path admin list queries still use sync legacy late fee unless callers pass resolved policy
- Resident Payments hub not yet listing `payment_receipts` / reminder history
- Receipt share/download public route
- Single-invoice waive UI on invoice detail
- Meta WhatsApp / SMS / email adapters (Phase 4)

| `collection_reminder_templates` | Body text + variables per `(key, channel)` |
| `collection_reminder_deliveries` | Delivery log with honest status |
| `payment_receipts` | Durable receipts linked to financial invoices |

**Seed defaults**

- Late fee: global **1%/day** (`percent_bps = 100`), grace 0, no cap — matches legacy `computeLateFee`
- Reminder policies: billing −7, −3, −1, 0 and due 0, +1, +3, +7 (WhatsApp templates)

### Late fee policy

- Service: `src/services/lateFeePolicy.ts` — `resolveActivePolicy`, `computeLateFeeWithPolicy`, `applyLateFeePolicy`
- `billing.computeLateFee` accepts optional `policy`; omit → legacy 1%/day
- Async path: `computeLateFeeForPg` resolves policy then computes
- Call sites that remain sync (e.g. `projectRentInvoice`) keep legacy behavior until they pass a resolved policy

### Reminder engine (WhatsApp Phase 1)

- **Not** Meta Cloud API — operator opens `wa.me` links
- Status enum (honest): `pending` | `sent_link` | `skipped` | `failed`
- `sent_link` = link generated and logged, not “message delivered by WhatsApp”
- Cron: `GET/POST /api/cron/collections-reminders` with `Authorization: Bearer $CRON_SECRET`
- Admin stub: `/admin/collections/reminders`

### Payment receipts

- `src/services/paymentReceipts.ts` — `createReceipt`, `listForCustomer`
- PDF stub: `src/lib/billing/receiptPdf.ts` (minimal pdf-lib layout)

### Advance rent

- SSOT: `resident_credit_ledger`
- `entry_kind` remains `credit` / `debit` / `applied` (enum)
- Advance posts use **reason** containing `advance_rent` (free text; no enum extension)
- Helper: `postAdvanceRentCredit` in `residentCreditLedger.ts`

### Reports & bulk ops

- `collectionsReports.ts` — Expected / Collected / Outstanding / Overdue / efficiency from RFE projections only
- `collectionsBulkOps.ts` — permission-gated stubs for bulk remind / waive
- Admin reports stub: `/admin/collections/reports`

---

## Gaps / next

- Wire `resolveActivePolicy` into hot invoice projection paths (async cache or batch)
- Single-invoice waive UI writing `late_fee_waivers`
- Reminder delivery history admin table
- Receipt share page + download route
- Implement bulk remind/waive beyond stubs
- Vercel cron schedule entry for `collections-reminders`
