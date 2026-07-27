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
- Routes: `/admin/collections`, `/admin/collections?view=calendar`

---

## Phase 2 — Billing events

Migration: **`0129_billing_events`**.

- Append-only `billing_events` log (`src/services/billingEvents.ts`) — best-effort, never fails billing
- Event types: `invoice.upcoming` / `generated` / `overdue` / `paid` / `partial` / `proof_submitted`
- Admin invoice lifecycle panel consumes the log; no second money calculator
- History helpers: `collectionsInvoiceHistory.ts` (resident-safe list available; hub wiring still pending)

---

## Phase 3 — Ops foundation (3.0–3.4)

Migration: **`0130_collections_ops`**.

### Schema

| Table | Purpose |
|-------|---------|
| `late_fee_policies` | PG-scoped or global late fee rules (`fixed_per_day` / `percent_of_principal`) |
| `late_fee_waivers` | Audit trail for waived late fees |
| `collection_reminder_policies` | Offset + anchor (`billing_date` / `due_date`) + channel |
| `collection_reminder_templates` | Body text + variables |
| `collection_reminder_deliveries` | Honest delivery log (`pending` / `sent_link` / `skipped` / `failed`) |
| `payment_receipts` | Receipt registry after pay / proof approve |

**Seed defaults:** global late fee 1%/day (`percent_bps = 100`); reminder offsets −7/−3/−1/0 (billing) and 0/+1/+3/+7 (due).

### Behaviour

- Late fee: `computeLateFee({ policy })` + `projectInvoice` options `lateFeePolicy` / `waiverPaise`; omit policy → legacy 1%/day
- Reminders cron: `/api/cron/collections-reminders` (Vercel `0 7 * * *`) → wa.me + delivery log (`sent_link` ≠ Meta-delivered)
- Receipts: auto-created on rent payment success and rent proof approval (best-effort)
- Advance: `postAdvanceRentCredit` posts to `resident_credit_ledger` with `advance_rent` reason marker
- Reports: `/admin/collections/reports` aggregates from RFE-projected rows only
- Bulk: `bulkRemindResidents` / `bulkWaiveLateFees` (permission-gated)
- Admin reminders: `/admin/collections/reminders`

---

## Follow-ups

- Batch-resolve late-fee policies into hot admin list projections (still sync-legacy unless policy passed)
- Resident Payments hub: receipts + reminder history cards
- Receipt share/download public route
- Single-invoice waive UI on invoice detail
- Emit `invoice.upcoming` when snapshots are introduced
- Meta WhatsApp / SMS / email adapters (Phase 4)
- One-time script: mirror remaining `checkoutCredits.advance_rent_credit` into ledger
