# Phase 4 — Payments operations runbook

This document is the source of truth for operating the payment + booking-
lifecycle subsystem shipped in Phase 4. It supersedes any conflicting
guidance in older docs.

---

## 1. Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | Postgres connection string. |
| `DATABASE_POOL_MAX` | no | `10` | Max pool size for `postgres-js`. |
| `PAYMENT_PROVIDER` | yes | `mock` | `mock` for dev/test, `razorpay` for prod. |
| `BOOKING_HOLD_MINUTES` | no | `15` | How long a `pending_payment` booking holds beds before the sweeper releases them. |
| `RAZORPAY_KEY_ID` | when `PAYMENT_PROVIDER=razorpay` | — | Razorpay API key id. |
| `RAZORPAY_KEY_SECRET` | when `PAYMENT_PROVIDER=razorpay` | — | Razorpay API key secret. |
| `RAZORPAY_WEBHOOK_SECRET` | when `PAYMENT_PROVIDER=razorpay` | — | Shared secret for HMAC-SHA256 webhook verification. |
| `CRON_SECRET` | yes | — | Bearer token required by the hold-release cron route. Generate with `openssl rand -hex 32`. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | when `PAYMENT_PROVIDER=razorpay` | — | Same as `RAZORPAY_KEY_ID`, exposed to the browser for the Razorpay checkout SDK. |

After changing any of these, restart the dev server. The `src/lib/env.ts`
getters validate on first read; misconfiguration surfaces at the first
request that needs the value, not at startup.

`.env.example` is the canonical list — keep it in sync when adding knobs.

---

## 2. Booking lifecycle (state machine)

```
                            createBooking (customer)
                                     │
                          ┌──────────▼──────────┐
                          │   pending_payment   │  reservations: hold
                          │   holdExpiresAt set │  (BOOKING_HOLD_MINUTES)
                          └────┬──────────┬─────┘
        payment_succeeded      │          │  payment_failed (webhook) /
        (webhook or admin      │          │  releaseExpiredHolds (cron) /
         offline payment)      │          │  customer cancel
                          ┌────▼─────┐    │
                          │ confirmed│    │
                          │ resv: active   │
                          └────┬─────┘    │
              admin/customer   │          │
              cancel           │          │
                          ┌────▼─────┐    │
                          │ cancelled│◄───┘
                          │ resv: cancelled
                          └────┬─────┘
                  full-refund  │
                  posted       │
                          ┌────▼─────┐
                          │ refunded │
                          └──────────┘
```

Notes:

- Admin-created bookings (`createdVia: 'admin'`) skip `pending_payment` and
  land in `confirmed` with `active` reservations.
- Every transition writes an `audit_log` row.
- Every external refund webhook (`recordExternalRefund`) is idempotent on
  `providerRefundId`.

---

## 3. Webhook endpoints

### `/api/webhooks/razorpay` (prod)

- Verifies `X-Razorpay-Signature` against `RAZORPAY_WEBHOOK_SECRET`
  (HMAC-SHA256, constant-time compare).
- Handles three events:
  - `payment.captured` ➝ `recordPaymentSuccess` (flips booking to
    `confirmed`, reservations to `active`).
  - `payment.failed` ➝ `recordPaymentFailure` (flips booking to
    `cancelled`, reservations to `cancelled`, writes a `failed` payment
    row). Requires `notes.booking_code` to resolve the booking — we
    inject it automatically in `createOrder`.
  - `refund.processed` ➝ `recordExternalRefund` (writes a negative
    payment row, updates the original payment to `partially_refunded` /
    `refunded`).
- Always responds 200 to acknowledge — Razorpay retries non-200 responses
  forever. The `stateChanged` flag in the response tells you whether the
  request mutated state or was an idempotent replay.

### `/api/webhooks/mock` (dev / CI only)

- Returns 404 when `PAYMENT_PROVIDER=razorpay`.
- Accepts hand-built JSON bodies (`{ kind: 'payment_succeeded' | 'payment_failed', ... }`)
  and routes them through the same `recordPaymentSuccess` / `recordPaymentFailure`
  functions as real Razorpay events. Used by `scripts/verify-payment-flow.ts`,
  `scripts/verify-payment-failure.ts`, and `scripts/verify-webhook-idempotency.ts`.

### Configuring Razorpay in production

1. Dashboard ➝ Settings ➝ Webhooks ➝ Create Webhook.
2. URL: `https://your-domain.com/api/webhooks/razorpay`.
3. Active events: `payment.captured`, `payment.failed`, `refund.processed`.
4. Set the secret to the same value as `RAZORPAY_WEBHOOK_SECRET`.
5. Enable webhook retries (Razorpay default is fine — our handlers are idempotent).

---

## 4. Hold-expiry cron

`pending_payment` bookings hold beds for `BOOKING_HOLD_MINUTES`. After that
they must be released so other customers can book. The sweeper that does
this is `releaseExpiredHolds()` in `src/services/bookingLifecycle.ts`,
exposed over HTTP at `/api/cron/release-holds`.

### Authentication

The route requires `Authorization: Bearer ${CRON_SECRET}`. Without the
header (or with a wrong value) the route returns 401 with no DB work.

### Vercel deployment

`vercel.json` already declares the schedule:

```json
{
  "crons": [
    { "path": "/api/cron/release-holds", "schedule": "*/5 * * * *" }
  ]
}
```

- Vercel hits the path via `GET` with `Authorization: Bearer ${CRON_SECRET}`
  attached automatically when `CRON_SECRET` is set as a project env var.
- **Hobby plan note**: Vercel Hobby supports daily crons only. On Hobby,
  change the schedule to `0 * * * *` (hourly) at most, or upgrade to Pro
  for `*/5 * * * *`.
- Cron jobs run in production deployments only — preview deployments and
  local dev are unaffected.

### Self-hosted / non-Vercel deployments

System cron, GitHub Actions, BetterStack — anything that can hit an
HTTP endpoint on a schedule. Examples:

**Linux/macOS crontab** (every 5 minutes):

```cron
*/5 * * * * curl -fsS -X GET -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/release-holds > /dev/null
```

**GitHub Actions** (`.github/workflows/release-holds.yml`):

```yaml
on:
  schedule:
    - cron: '*/5 * * * *'
jobs:
  sweep:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X GET \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://your-domain.com/api/cron/release-holds
```

### Manual invocation

```bash
npx tsx scripts/sweep-holds.ts
# or
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/release-holds
```

The endpoint response includes counts: `{ ok: true, scanned, released, cancelledBookings }`.

---

## 5. Ownership / auth posture (Phase 4)

Auth.js + OTP land in Phase 6. Until then:

- **Per-booking pages** (`/booking/[code]`, `/booking/[code]/pay`) — the
  booking code in the URL is the bearer credential. Don't share it.
- **Cancellation** (`/booking/[code]` → "Cancel booking") — requires the
  customer to re-enter the phone number they booked with. Mismatch ➝
  generic "couldn't verify ownership" error. See
  `app/(customer)/booking/[bookingCode]/actions.ts`.
- **My-bookings** (`/account/bookings`) — phone-number GET form. No
  cookies, no session. The phone is the bearer credential. The empty
  state is identical for "phone not registered" vs. "no bookings on
  this phone" so we don't enumerate customers.
- **Admin pages** (`/admin/*`) — unauthenticated. Lock down at the proxy
  / IP-allowlist tier until Phase 6.

---

## 6. Verification scripts

All run against `http://localhost:3000` (override with arg 2) unless
otherwise noted. Start the dev server first.

| Script | Asserts |
| --- | --- |
| `verify-queries.ts` | Every customer + admin query returns expected shapes (no live server needed). |
| `verify-booking.ts` | `createBooking()` happy path (no live server needed). |
| `verify-payment-flow.ts` | create ➝ pay ➝ replay ➝ cancel. |
| `verify-payment-failure.ts` | create ➝ `payment_failed` ➝ idempotent replay; checks ledger + audit log. |
| `verify-webhook-idempotency.ts` | Same `payment_succeeded` event fired N times produces one payment row + one `stateChanged=true`. |
| `verify-hold-expiry.ts` | Backdating `holdExpiresAt` + sweeping releases the hold and cancels the booking. |
| `verify-cancel-refund.ts` | Tier boundaries — `full` / `partial` / `none` refunds. |

CI should run the unit suite + `verify-queries.ts` + `verify-booking.ts`
on every commit; the live-server scripts are appropriate for a smoke
suite running against a pre-prod environment.

---

## 7. Incident playbooks

### "Customer paid but booking is still `pending_payment`"

1. Find the booking: `select * from bookings where booking_code = '...';`
2. Look at the payments ledger:
   `select * from payments where booking_id = '...' order by created_at;`
3. If there's a Razorpay payment row with `status = 'succeeded'` but the
   booking is still `pending_payment`, the booking-flip path inside the
   webhook handler didn't run (most likely DB error). Look at server
   logs around the payment's `created_at`.
4. To force-confirm, run the admin "Record offline payment" form on
   `/admin/bookings/[id]` with amount 0 (audit-safe).

### "Cron isn't releasing holds"

1. Hit the endpoint manually:
   `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/release-holds`
2. If you get 401, `CRON_SECRET` isn't set on the deployment.
3. If you get 200 with `released: 0` but you expected releases, check
   `select id, hold_expires_at, status from bed_reservations where status = 'hold' order by hold_expires_at;` —
   only rows where `hold_expires_at < now()` are eligible.

### "Webhook secret rotation"

1. Add the new secret to Razorpay alongside the old one (Razorpay
   supports multiple active webhooks).
2. Deploy the new `RAZORPAY_WEBHOOK_SECRET` value.
3. Delete the old webhook in Razorpay.
4. No code change required — verification is per-request.

### "Refund issued in dashboard isn't reflected in the app"

1. Confirm `refund.processed` is enabled on the webhook in Razorpay.
2. Manually replay the webhook from the Razorpay dashboard ➝ webhook
   logs. The replay is idempotent.
3. If the original payment isn't found, the refund was issued against a
   payment that never landed in our ledger — investigate the original
   `payment.captured` webhook (check signature failures in logs).
