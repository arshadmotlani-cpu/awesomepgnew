# Phase 5.5 — Resident billing, electricity, deposits & vacating

Companion to [`PHASE5_OPERATIONS.md`](./PHASE5_OPERATIONS.md). Phase 5.5
turns the booking platform into a recurring-billing **PG operations
platform** for monthly residents. Daily / weekly / 15-day guests are
untouched — their flows continue to work exactly as Phase 4.

> **Scope reminder.** "Monthly resident" = a booking with
> `duration_mode IN ('monthly', 'open_ended')` AND `status='confirmed'`
> AND at least one `bed_reservation` with `status='active'`. Everything
> in this phase keys off that definition.

---

## 1. Data model — what was added

Migration: **`src/db/migrations/0004_phase5_5_resident_billing.sql`**.

### New enums

| Enum                          | Values                                                       |
| ----------------------------- | ------------------------------------------------------------ |
| `rent_invoice_status`         | `pending` · `paid` · `overdue` · `cancelled`                 |
| `electricity_invoice_status`  | `pending` · `paid` · `cancelled`                             |
| `deposit_entry_kind`          | `collected` · `deducted` · `refunded`                        |
| `vacating_status`             | `pending` · `approved` · `completed` · `rejected`            |
| `payment_purpose` (**extended**) | + `rent`, + `electricity`, + `deposit_deduction`           |

### New tables

| Table                  | One row per…                                  | Key invariants                                                                          |
| ---------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `rent_invoices`        | (booking, billing_month) for monthly stays    | `UNIQUE(booking_id, billing_month)`, `UNIQUE(invoice_number)`                           |
| `electricity_bills`    | (room, billing_month)                         | `UNIQUE(room_id, billing_month)`, `total_paise = floor(units × rate)` enforced in code  |
| `electricity_invoices` | (electricity_bill, monthly resident)          | `UNIQUE(electricity_bill_id, booking_id)`, `UNIQUE(invoice_number)`                     |
| `deposit_ledger`       | every deposit movement (append-only)          | `CHECK(entry_kind, sign(amount_paise))` — collected > 0, deducted/refunded < 0          |
| `vacating_requests`    | open vacating notice for a booking            | `UNIQUE(booking_id)` (only one open notice per booking)                                 |

### Invoice numbering

* Rent: `RNT-YYYY-MM-NNNN` where NNNN is a per-month sequence,
  ordered by booking creation order. Computed in
  `generateRentInvoicesForMonth` inside the transaction so retries are
  safe.
* Electricity: `ELE-YYYY-MM-NNNN` per billing month.

### Booking lifecycle integration

* `bookings.depositPaise` is unchanged. When a booking payment lands,
  `recordPaymentSuccess` now *also* writes a `collected` row to
  `deposit_ledger` (idempotent on `related_payment_id`). The deposit
  ledger is therefore the single source of truth for refundable balance;
  `bookings.depositPaise` is just the "amount collected with booking
  payment" snapshot.
* `bookings.status` may now flip to `completed` when the related
  vacating request is completed. We only flip from `confirmed` —
  cancelled / refunded bookings are not touched.

---

## 2. Service layer

All Phase 5.5 services live under `src/services/`. They follow the
Phase 4 conventions: pure helpers in `billing.ts`, transactional
writers elsewhere, and audit-logged side effects.

| File                              | Responsibilities                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `services/billing.ts`             | Pure math: `monthBounds`, `dueDateForMonth`, `computeLateFee`, `vacatingPenalty`, `splitElectricity`, `prorateForMonth`, `formatInr`. 100% unit-tested in `tests/unit/billing.test.ts`. |
| `services/rentInvoices.ts`        | `generateRentInvoicesForMonth` (idempotent, txn), `markOverdueInvoices` (daily sweeper), `projectInvoice` (read-time late-fee math), `recordRentPaymentSuccess` / `Failure`, `cancelFutureRentInvoices`. |
| `services/electricityBilling.ts`  | `createElectricityBill` (computes occupants, splits, fans out invoices in one transaction; rejects duplicates with `kind='already_exists'`), `recordElectricityPaymentSuccess` / `Failure`, `cancelElectricityInvoicesForBooking`. |
| `services/deposits.ts`            | `recordDepositCollected` (idempotent on `relatedPaymentId`), `recordDepositDeducted`, `recordDepositRefunded`, `getDepositSummaryForBooking`, `backfillDepositCollectedRows` (one-time migration helper). |
| `services/vacating.ts`            | `submitVacatingRequest` (snapshots monthly rent + 5-day fixed-penalty at SUBMIT time), `approveVacatingRequest`, `rejectVacatingRequest`, `completeVacatingRequest` (the heavy lifter: writes deduction + refund to ledger, cancels future rent + electricity invoices, marks booking `completed`). |

### Late-fee policy (rent)

Per spec, **1% of the original rent per day from the 6th of the month**.
We apply it linearly (NOT compounded) and snapshot it at payment time:

```text
graceDays      = 5
overdueDays    = max(0, daysSince(billingMonth.first) - graceDays)
accruedLateFee = floor(rentPaise × overdueDays / 100)
```

Rounding once at the end (rather than per-day) is intentional: it never
overcharges the resident vs the spec example. `projectInvoice()` does
this calc on read; `lateFeeLockedPaise` freezes the value at payment
time so post-payment displays are stable.

### Vacating policy

Always **5 days × dailyRate**, where `dailyRate = floor(monthlyRent/30)`
— the spec's example: ₹6,000 → ₹200/day → ₹1,000 fixed penalty.

* `noticeDays ≥ 15` ⇒ no deduction; full deposit refunded.
* `noticeDays < 15` ⇒ deduction = `vacatingPenalty(monthlyRent)`,
  refund = `max(0, depositBalance − deduction)`.

The penalty is **snapshotted on the `vacating_requests` row at SUBMIT
time** so future rent changes don't silently rewrite an old request.

### Electricity split

```text
perResidentPaise        = floor(totalPaise / monthlyOccupantCount)
roundingRemainderPaise  = totalPaise - perResidentPaise × monthlyOccupantCount
```

The remainder (always 0 ≤ r < N) is absorbed by the operator. With zero
monthly occupants, no invoices are created and the bill row records
`per_resident_paise = 0`.

### Electricity meter readings & due date *(added in delta sweep)*

The admin form takes `previousReadingUnits` + `currentReadingUnits`
(typed straight from the meter, not pre-computed units). The service
derives `unitsConsumed = current − previous` and the DB enforces:

```sql
electricity_bills_readings_non_negative   -- both readings ≥ 0
electricity_bills_readings_ordered        -- current ≥ previous
electricity_bills_units_match_readings    -- units_consumed = current − previous
```

Per-resident electricity invoices now carry:

* `due_date` = `bill.createdAt + 3 days` (spec: "Deadline: 3 days")
* `late_fee_locked_paise` (nullable) — populated at payment time

### Electricity late-fee policy

Mirrors the rent policy but is event-triggered (no grace period beyond
the 3-day deadline):

```text
Day of due_date  → no fee
Day after        → 1% of principal
N days after     → floor(amountPaise × N / 100)
```

`projectElectricityInvoice(invoice, today)` is the read-side projector;
`computeElectricityLateFee()` is the pure helper that both it and
`recordElectricityPaymentSuccess` use to keep paid/pending math identical.

---

## 3. Webhook fork

`src/services/payments.ts` extends `PaymentPurposeTag`:

```ts
export type PaymentPurposeTag =
  | { purpose: 'booking' }
  | { purpose: 'extension'; extensionId: string }
  | { purpose: 'rent'; rentInvoiceId: string }
  | { purpose: 'electricity'; electricityInvoiceId: string };
```

Both `mockProvider.verifyWebhook` and `razorpayProvider.verifyWebhook`
now parse `rent` / `electricity` purpose tags from the inbound payload.
The webhook routes (`/api/webhooks/mock` and `/api/webhooks/razorpay`)
dispatch:

* `booking`     → `recordPaymentSuccess` / `recordPaymentFailure`
* `extension`   → `recordExtensionPaymentSuccess` / `Failure`
* `rent`        → `recordRentPaymentSuccess` / `Failure`
* `electricity` → `recordElectricityPaymentSuccess` / `Failure`

Idempotency is enforced the same way as Phase 4: the
`payments(provider, provider_payment_id)` unique index makes a webhook
replay a no-op at the storage layer. Each lifecycle function returns
`{ stateChanged: false }` on replay.

---

## 4. Cron schedules

`vercel.json` gets one new entry:

```jsonc
{ "path": "/api/cron/generate-monthly-rent", "schedule": "0 2 * * *" }
```

That route does **two** things per call:

| Trigger                          | Action                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Always (every daily run)         | `markOverdueInvoices()` — flips `pending` to `overdue` once due date passes  |
| Only on the 1st (or `force=1`)   | `generateRentInvoicesForMonth(thisMonth)` — idempotent on `(booking, month)` |

Manual override knobs: `?month=YYYY-MM-DD&force=1`. Auth via
`CRON_SECRET` (Bearer token or query-string), same pattern as
`/api/cron/release-holds`.

Phase 4's `release-holds` cron is untouched; we did not add anything to
it for Phase 5.5.

---

## 5. Customer surfaces

| Route                                                  | Purpose                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `/account/resident?phone=…`                            | Resident dashboard. Phone-gated read across ALL the resident's monthly bookings. Cards: rent due, electricity due, late fees (rent + electricity), deposit balance. |
| `/account/resident/pay-rent/[invoiceId]?phone=…`       | Pay a specific rent invoice. Mock or Razorpay. Renders the live late-fee projection.                 |
| `/account/resident/pay-electricity/[invoiceId]?phone=…`| Pay an electricity invoice. Shows meter readings, due date, and the projected 1%/day penalty.        |
| `/account/resident/request-vacating/[bookingId]?phone=…`| Submit a vacating notice. Live preview of compliance + 5-day penalty.                                |
| `/account/resident/history/[bookingId]?phone=…`        | Payment history (all purposes: booking, extension, rent, electricity, deposit). Phone-gated, constant-time compare. |

Phone gating uses `normalisePhone` + `timingSafeEqual`, the same
ownership check used by the existing Phase 4 `My bookings` page.

---

## 6. Admin surfaces

| Route                              | Adds                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `/admin/rent`                      | Stats cards + filterable rent-invoices table. Buttons: "Generate invoices for this month", "Sweep overdue now". |
| `/admin/electricity`               | All electricity bills with per-bill distribution + invoice paid counts.                    |
| `/admin/electricity/new`           | Form takes **previous + current meter readings** and rate. Live preview shows derived units, total, and the 3-day due-date / 1%/day penalty rule. |
| `/admin/vacating`                  | All vacating requests filtered by status. Buttons: Approve / Reject / Complete.            |
| `/admin/deposits`                  | Per-booking deposit summaries (collected / deducted / refunded / refundable balance). "Open →" links to per-booking detail. |
| `/admin/deposits/[bookingId]`      | Per-booking deposit detail: balance cards, full append-only ledger, and three admin forms — **Add / Deduct / Refund**. Every action writes an audit-log entry. |

Sidebar adds a "Resident billing" section grouping the four pages.

---

## 7. Runbooks

### "I need to generate rent invoices manually"

Either:

```bash
# Via cron route (production-safe)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://example.com/api/cron/generate-monthly-rent?month=2026-06-01&force=1"
```

…or click "Generate invoices" on `/admin/rent` after picking the month.
Both paths call `generateRentInvoicesForMonth`, which is idempotent on
`(booking, month)` — re-running is safe.

### "A rent invoice was paid offline / outside the app"

Use `recordRentPaymentSuccess` with `provider='offline'` and a
deterministic `providerPaymentId` like `offline_<adminId>_<timestamp>`.
This writes a `payments` row + audit log entry just like a webhook
would. (Admin UI button for this is a follow-up — see "Remaining gaps"
below.)

### "I need to add / deduct / refund a deposit by hand"

Use `/admin/deposits/[bookingId]`:

1. Find the booking via `/admin/deposits` (or paste the booking UUID).
2. Pick the right card — **Add** (top-up), **Deduct** (damage charge,
   unpaid rent), or **Refund** (refund issued).
3. Amount + reason are both required. The reason becomes the
   `deposit_ledger.reason` and the `audit_log.diff.reason`.

The DB enforces sign at the storage layer
(`deposit_ledger_amount_sign_matches_kind` check) — the service can't
accidentally write a positive deduction or a negative collection.

### "I created an electricity bill with wrong units"

There's no in-app edit. The intended workflow is:

1. The bad bill stays as-is (so the audit trail is preserved).
2. Cancel its invoices manually: call
   `cancelElectricityInvoicesForBooking(bookingId)` per affected
   booking, OR mark them `cancelled` via a small admin script.
3. Re-issue with `createElectricityBill({ roomId, billingMonth: next })`
   for the *next* month with adjustments — there's no way to put two
   bills against the same `(room, month)`.

### "A resident wants to extend their vacating date"

Reject the existing request first (`rejectVacatingRequest`), then ask
the resident to submit a new one. UNIQUE(booking_id) prevents two open
requests against the same booking.

### "I need to backfill the deposit_ledger for old bookings"

Call `backfillDepositCollectedRows()` once, from a script. It writes
one `collected` row per existing confirmed booking with
`deposit_paise > 0`, idempotently keyed on the booking's deposit
payment id when available.

---

## 8. Verification

Phase 5.5 ships **5 new** end-to-end scripts and extends one:

| Script                                  | What it proves                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `verify-rent-billing.ts`                | Generates invoices for a real monthly booking, pays one via webhook, replays the webhook idempotently, sweeps overdue. |
| `verify-electricity-split.ts`           | 3-bed room: 2 monthly + 1 daily; meter readings 1500 → 1650 = 150 units × ₹10 = ₹1,500 splits ₹750 × 2 (daily excluded); due date set 3 days out; duplicate bill rejected. |
| `verify-late-fee-calculation.ts`        | Pure-math + integration: day 5 fee=0, day 6 = 1% of rent, day 30 = 30% (linear). Locked on payment. |
| `verify-vacating-deduction.ts`          | Short notice (5 days) → 5-day penalty; compliant notice (20 days) → full refund. UNIQUE guard.   |
| `verify-deposit-ledger.ts`              | Booking payment auto-mirrors `collected`; CHECK rejects sign violations; running balance correct. |
| `verify-queries.ts` (**extended**)      | All Phase 5.5 admin + customer queries return without crash on the seeded DB.                    |

Plus **23 unit tests** for `services/billing.ts` (18 base + 5 new for
electricity due date / late fee) in `tests/unit/billing.test.ts`.
Full suite: **124/124 unit tests pass; 14/14 verify scripts pass.**

`verify-electricity-split.ts` was tightened during the delta sweep to
require *all* beds in the picked room be free for the test window —
without this, lingering monthly bookings from earlier runs on adjacent
beds would inflate `monthlyOccupantCount` and flake the assertion.

---

## 9. Known gaps / follow-ups

These were explicitly out of scope for Phase 5.5 but worth tracking:

1. **Admin offline-payment buttons** for rent / electricity (the service
   functions exist; the UI buttons don't yet).
2. **Rent invoice cancellation UI** — only available via direct service
   call. Useful for "billed in error" scenarios.
3. **Electricity bill edit** — must cancel + reissue manually.
4. **Bulk vacating workflow** — admin completes one request at a time.
5. **Email / SMS receipts** for rent and electricity payments.
6. **Notice-period clock-stop** — if a resident is mid-vacating and
   misses a rent payment, late fees still accrue against the unbilled
   portion. The current behavior is conservative (resident is on the
   hook); a future phase could pro-rate.
7. **15-day stay type** — the spec lists "15-day" as a separate resident
   class. Current implementation models that as `weekly` (since `weekly`
   is also excluded from rent/electricity). If a true distinct type is
   needed (e.g. for reporting), add it to `duration_mode_enum` in a
   future migration.
