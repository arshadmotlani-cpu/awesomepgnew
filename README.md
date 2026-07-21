# Awesome PG

Bed-first booking platform for paying-guest properties.

Built on Next.js 16, React 19, TypeScript, Tailwind v4, PostgreSQL,
Drizzle ORM. PostgreSQL's `daterange` + GiST EXCLUDE constraints stop
overlapping bookings at the database tier; payments are gated through a
provider-agnostic interface that ships with a Razorpay adapter and a
mock adapter for development.

## Documentation

- [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) — full product + technical plan, phase
  roadmap, definition-of-done.
- [`DATABASE_SETUP.md`](./DATABASE_SETUP.md) — installing Postgres locally,
  running migrations, seeding fixtures.
- [`PHASE4_OPERATIONS.md`](./PHASE4_OPERATIONS.md) — payments runbook:
  environment variables, webhook URLs, cron scheduling, the `pending_payment`
  ➝ `confirmed` lifecycle, and incident playbooks.
- [`PHASE5_OPERATIONS.md`](./PHASE5_OPERATIONS.md) — stay-extension runbook:
  schema delta, webhook routing on `notes.kind='extension'`, customer +
  admin surfaces, and how the existing hold-expiry cron now sweeps
  extensions too.
- [`PHASE5_5_OPERATIONS.md`](./PHASE5_5_OPERATIONS.md) — resident-billing
  runbook: monthly rent invoices + late fees, room-level electricity
  bills + per-resident split, deposit ledger, and the vacating workflow
  with pro-rata missing-notice-days deduction.

## Quick start

```bash
# 1. install
npm install

# 2. create the database
createdb awesome_pg

# 3. configure env (copy .env.example → .env then edit)
cp .env.example .env

# 4. migrate + seed
npm run db:migrate
npm run db:seed

# 5. run the dev server
npm run dev
```

App is at <http://localhost:3000>.

**Authentication (Phase 6):**

- Public browsing (`/pgs`, rooms, availability) does not require login.
- Booking, payments, extensions, and resident dashboards require customer
  sign-in via email verification at `/login`.
- Customer sign-in sends a 6-digit code by **email** (Resend preferred, SMTP
  fallback). Configure `RESEND_API_KEY` + `EMAIL_FROM`, or `SMTP_HOST` +
  `SMTP_PORT` + `EMAIL_FROM`. In development without credentials, codes are
  logged to the server console. Codes expire in 5 minutes; resend is allowed
  after 30 seconds. Send/verify attempts are logged in `email_otp_attempt_log`.
- Transactional emails (booking confirmation, payment receipts, rent/electricity
  reminders, vacating and extension updates) use the same email provider.
- Admin console is at `/admin` (redirects to `/admin/login`). After
  `npm run db:seed` in **development**, sign in as `admin@awesomepg.local` /
  `changeme` — you will be forced to set a new password on first login.
  **Production** does not seed a default password; set `ADMIN_INITIAL_PASSWORD`
  when running `db:seed` to bootstrap the first super_admin (also requires
  immediate password change).
- Set `AUTH_SECRET` in production (`openssl rand -hex 32`).

## Project layout

```
app/
  (admin)/              admin dashboard shell + management pages
    admin/rent          Phase 5.5 — monthly rent invoices
    admin/electricity   Phase 5.5 — electricity bills + creation form
    admin/vacating      Phase 5.5 — vacating requests + admin actions
    admin/deposits      Phase 5.5 — deposit ledger summaries
  (customer)/           public PG browsing, booking flow, My-Bookings
    booking/[code]/     unified status page (pending_payment → confirmed)
    booking/[code]/pay  payment page (Razorpay + mock adapters)
    account/bookings    signed-in customer's bookings
    account/resident    Phase 5.5 — monthly-resident dashboard + actions
  login/                customer phone OTP sign-in
  admin/login/          admin email + password sign-in
  api/
    availability/       public availability JSON
    webhooks/razorpay   verified Razorpay webhook receiver (booking + extension + rent + electricity)
    webhooks/mock       dev-only mock webhook receiver
    cron/release-holds  authenticated cron sweeper (holds + extensions)
    cron/generate-monthly-rent  Phase 5.5 daily rent generator + overdue sweep

src/
  db/                   Drizzle schema, migrations, seed, queries
  services/
    pricing.ts          quote builder (daily/weekly/monthly/open-ended)
    availability.ts     bed availability + next-free-date
    booking.ts          createBooking() with pricing snapshot + hold
    bookingLifecycle.ts payment-success / payment-failure / cancel / sweep
    payments.ts         provider abstraction (Razorpay + mock)
    cancellationPolicy.ts pure refund-tier calculator
    billing.ts          Phase 5.5 — pure math (late fee, prorate, electricity split)
    rentInvoices.ts     Phase 5.5 — generate / pay / overdue-sweep monthly rent
    electricityBilling.ts Phase 5.5 — create room bill + fan out per-resident invoices
    deposits.ts         Phase 5.5 — append-only deposit ledger
    vacating.ts         Phase 5.5 — vacating workflow + pro-rata notice deduction
  components/{admin,customer}/  React UI
  lib/                  env, format, phone normaliser, booking-code minter

tests/unit/             node:test unit suite
scripts/                verify-* integration scripts (see below)
```

## Useful scripts

```bash
npm run db:migrate         # apply pending migrations
npm run db:seed            # reseed fixtures (idempotent)
npm run db:reset           # nuke + re-migrate + reseed
npm run test               # node:test unit suite

npx tsx scripts/verify-queries.ts            # regression for all customer + admin queries
npx tsx scripts/verify-booking.ts            # createBooking() smoke test
npx tsx scripts/verify-payment-flow.ts       # full pay → confirm → cancel happy path
npx tsx scripts/verify-payment-failure.ts    # payment.failed → cancel + audit log
npx tsx scripts/verify-webhook-idempotency.ts  # replay-safe webhook contract
npx tsx scripts/verify-hold-expiry.ts        # cron sweeper releases expired holds
npx tsx scripts/verify-cancel-refund.ts      # full / partial / no-refund tiers
npx tsx scripts/verify-extension-flow.ts     # Phase 5: request → pay → idempotency → snapshot
npx tsx scripts/verify-extension-conflict.ts # Phase 5: overlapping extension rejected
npx tsx scripts/verify-extension-hold-expiry.ts # Phase 5: pending extension cleaned up by cron
npx tsx scripts/verify-rent-billing.ts       # Phase 5.5: generate → pay → idempotent replay → overdue sweep
npx tsx scripts/verify-electricity-split.ts  # Phase 5.5: monthly-only occupancy, ₹750 × 2 split, duplicate guard
npx tsx scripts/verify-late-fee-calculation.ts # Phase 5.5: 1%/day from day 6, locked on payment
npx tsx scripts/verify-vacating-deduction.ts # Phase 5.5: pro-rata notice deduction vs full refund
npx tsx scripts/verify-deposit-ledger.ts     # Phase 5.5: auto-mirror, signed ledger, CHECK guards
npx tsx scripts/sweep-holds.ts               # manual hold-expiry sweep
```

The `verify-*` scripts (except `verify-queries.ts` and `verify-booking.ts`)
talk to the live dev server — start `npm run dev` first.

## Phase status

| Phase | Description | Status |
| --- | --- | --- |
| 0 | Project foundation | ✓ done (auth deferred to Phase 6) |
| 1 | Database layer + seeds | ✓ done |
| 2 | Pricing & availability engine | ✓ done |
| 3 | Customer browsing + booking flow | ✓ done |
| 4 | Payments + booking lifecycle | ✓ done (see `PHASE4_OPERATIONS.md`) |
| 5 | Stay extensions (confirmed bookings only) | ✓ done (see `PHASE5_OPERATIONS.md`) |
| 5.5 | Resident billing, electricity, deposits, vacating | ✓ done (see `PHASE5_5_OPERATIONS.md`) |
| 6+ | KYC, real auth, notifications | not started |
