# Booking Payment E2E Report

**Date:** 23 June 2026  
**Runner:** `scripts/verify-booking-payment-e2e.ts`  
**Fix baseline:** commit `cd822da` (offline path, overpayment, rejection)  
**Related:** [`BOOKING_PAYMENT_VERIFICATION.md`](./BOOKING_PAYMENT_VERIFICATION.md) · [`BOOKING_PAYMENT_FIX_REPORT.md`](./BOOKING_PAYMENT_FIX_REPORT.md)

---

## Overall status

| Field | Value |
|-------|-------|
| **BOOKING PAYMENT** | **NOT VERIFIED PASS** |
| **E2E run** | **FAIL / BLOCKED** |
| **Staging DB** | Not available in agent environment |
| **Local DB attempt** | Schema drift — `bookings.stay_type` column missing |
| **Screenshots** | N/A — service-layer script only (no Playwright/browser harness) |

> Booking Payment cannot be marked **VERIFIED PASS** until the three scenarios pass against a migration-current staging database.

---

## How to run (operator)

```bash
# Pull staging credentials first, e.g.:
# vercel env pull .env.staging --environment=preview

DOTENV_CONFIG_PATH=.env.staging npx tsx scripts/verify-booking-payment-e2e.ts
```

Machine-readable output: [`booking-payment-e2e-results.json`](./booking-payment-e2e-results.json)

---

## Environment attempted

| Target | Host | Result |
|--------|------|--------|
| Agent shell | — | No `DATABASE_URL` |
| `.env.bak` (local Postgres) | `localhost` | Connected; **createBooking failed** — missing `stay_type` column on `bookings` |
| Vercel staging env files | — | No resolvable `DATABASE_URL` in workspace copies |

**Root cause (local):** Code expects `bookings.stay_type` (migration applied on staging/production). Local Postgres schema is behind current Drizzle schema.

---

## Scenario results

### 1. Full booking payment approval (QR proof → admin approve)

| Field | Value |
|-------|-------|
| **STATUS** | **FAIL** (blocked at setup) |
| **Booking ID** | — |
| **Booking code** | — |
| **Payment ID** | — |
| **Ledger IDs** | — |
| **Audit IDs** | — |
| **PG payment record ID** | — |
| **Screenshot** | N/A |

**Error:** `createBooking failed` — insert into `bookings` includes `stay_type=monthly_stay` but local table has no `stay_type` column.

**Expected checks (when runnable):**

| Check | Expected |
|-------|----------|
| `payments` | 1 row, `purpose=booking`, `status=succeeded` |
| `deposit_ledger` | ≥1 `collected` row matching deposit portion |
| `audit_log` | `payment_succeeded` on booking |
| `email_delivery_log` | `booking_confirmed`, `payment_receipt` |
| `bookings.status` | `confirmed` |
| `bed_reservations.status` | `active` (primary) |
| Resident access | `isResidentDashboardUnlocked` = true |
| Revenue visibility | No rent invoice at checkout (`revenueRentInvoiceCreated` = false) |

---

### 2. Overpayment with wallet_credit

| Field | Value |
|-------|-------|
| **STATUS** | **FAIL** (blocked at setup) |
| **Booking ID** | — |
| **Payment ID** | — |
| **Ledger IDs** | — |
| **Audit IDs** | — |
| **Screenshot** | N/A |

**Error:** Same `createBooking` schema failure as scenario 1.

**Expected checks (when runnable):**

| Check | Expected |
|-------|----------|
| All scenario 1 checks | Pass |
| Extra ledger row | Reason prefix `BOOKING_OVERPAYMENT_WALLET_CREDIT:` |
| Extra audit | `booking_overpayment_wallet_credit` |
| Notification | `overpayment_wallet_credit` in `email_delivery_log` |
| Revenue | No invoice; wallet liability ↑ via ledger |

---

### 3. Offline admin payment

| Field | Value |
|-------|-------|
| **STATUS** | **FAIL** (blocked at setup) |
| **Booking ID** | — |
| **Payment ID** | — |
| **Ledger IDs** | — |
| **Audit IDs** | — |
| **Screenshot** | N/A |

**Error:** Same `createBooking` schema failure as scenario 1.

**Expected checks (when runnable):**

| Check | Expected |
|-------|----------|
| Path | `recordPaymentSuccess({ provider: 'cash', recordedByAdminId })` |
| Same downstream as QR | Ledger, prior outstanding, notifications, occupancy |
| Audit actor | `payment_succeeded` with `actorType=admin` |

---

## Verification matrix (actual vs expected)

| Dimension | Scenario 1 | Scenario 2 | Scenario 3 |
|-----------|------------|------------|------------|
| payments table | NOT RUN | NOT RUN | NOT RUN |
| deposit_ledger | NOT RUN | NOT RUN | NOT RUN |
| audit_log | NOT RUN | NOT RUN | NOT RUN |
| notifications | NOT RUN | NOT RUN | NOT RUN |
| booking status | NOT RUN | NOT RUN | NOT RUN |
| reservation status | NOT RUN | NOT RUN | NOT RUN |
| resident access | NOT RUN | NOT RUN | NOT RUN |
| revenue visibility | NOT RUN | NOT RUN | NOT RUN |

---

## Screenshots

Browser/UI screenshots were **not captured**. This verification pass uses a **service-layer E2E script** that exercises the same code paths as:

- Customer: `POST /api/payment-record/booking` → `submitBookingPaymentRecord`
- Admin: `reviewPaymentRecord(..., 'approved')` / `recordPaymentSuccess` (offline)

To add UI screenshots, run the three flows manually on staging and attach to this doc, or add Playwright coverage in a follow-up pass.

---

## Risk R1 — Should booking confirmation fail if deposit ledger write fails?

### Current behavior

In `recordPaymentSuccess()` (`src/services/bookingLifecycle.ts`):

1. **Transaction (atomic):** insert `payments`, flip `bookings` → `confirmed`, flip `bed_reservations` → `active`, insert `audit_log` `payment_succeeded`.
2. **Post-transaction (best-effort):** deposit mirror, prior outstanding, overpayment, notifications — wrapped in:

```534:536:src/services/bookingLifecycle.ts
      } catch (depositErr) {
        console.error('deposit ledger mirror failed:', depositErr);
      }
```

If `recordDepositCollected()` throws after the transaction commits, the booking is **already confirmed** and the resident hub is unlocked, but **deposit_ledger may be empty or incomplete**.

### Recommendation: **Fail-closed (with compensation)**

| Option | Verdict |
|--------|---------|
| **A. Fail-closed** — move deposit ledger writes into the same DB transaction as booking confirm | **Recommended** for financial integrity |
| **B. Fail-open (current)** — log and continue | Acceptable only if ops manually backfills ledger 100% of the time |
| **C. Compensating transaction** — on ledger failure, revert booking to `pending_approval` + alert | Good interim if full transactional merge is deferred |

**Why fail-closed:** Deposit ledger is SSOT for deposit money (`docs/SYSTEM_TRUTH_MAP.md`). A confirmed booking with zero ledger row creates:

- Incorrect resident wallet / deposit due displays
- Checkout settlement miscalculation at vacating
- Admin deposit panels showing “collected ₹0” despite successful payment

**Impact of implementing fail-closed:**

| Area | Impact |
|------|--------|
| Booking confirm | Rolls back if ledger insert fails — customer stays `pending_approval` |
| Occupancy | Bed stays on hold until ledger succeeds or admin intervenes |
| Notifications | Should not fire until full success (move notifications after ledger block or gate on success flag) |
| Offline / QR paths | Same behavior — consistent |
| Ops | Rare DB constraint errors surface as user-visible failure instead of silent drift |

**Suggested implementation (future PR, not this pass):**

1. Move `recordDepositCollected`, `applyPartialDepositOnConfirm`, and prior-outstanding slices inside the payment transaction **or** use saga: confirm → ledger → on failure run `compensateFailedBookingPayment()` (cancel confirm + mark payment `failed`).
2. Remove bare `catch` that swallows deposit errors.
3. Add integration test: mock ledger failure → assert booking remains unconfirmed.

**R1 status:** **OPEN** — documented; not fixed in this verification pass.

---

## Unit / build verification (completed)

| Check | Status |
|-------|--------|
| `tests/unit/bookingOverpayment.test.ts` | PASS |
| `tests/unit/bookingApproval.test.ts` | PASS |
| `tests/unit/bookingCheckoutTotals.test.ts` | PASS |
| `npm run build` | PASS |

---

## Next steps to close Booking Payment

1. Run migrations on target DB: `npm run db:migrate` (or staging equivalent).
2. Set `DATABASE_URL` to **staging** (not stale local).
3. Re-run: `npx tsx scripts/verify-booking-payment-e2e.ts`
4. Optionally capture admin payment-reviews + resident hub screenshots.
5. If all three scenarios PASS, update this doc header to **BOOKING PAYMENT = VERIFIED PASS**.
6. Schedule R1 fail-closed fix before closing Deposits workflow.

---

## Raw run output

See [`booking-payment-e2e-results.json`](./booking-payment-e2e-results.json) — `overall: "FAIL"`, all scenarios blocked at `createBooking`.
