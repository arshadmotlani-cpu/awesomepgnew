# Awesome PG — Project Plan

A complete planning document for the **Awesome PG** management system. This plan defines the database, folder layout, user/admin flows, feature catalog, and a phased delivery roadmap. **No application code is written yet** — this document is the contract that the implementation will follow.

---

## 1. Product Overview

Awesome PG is a multi-PG management platform with two surfaces:

- **Customer surface** — public-facing site for discovering PGs, viewing per-bed availability, booking one or more beds for flexible durations, paying online, and extending an ongoing stay.
- **Admin surface** — internal console for operators to manage the physical inventory (PGs → floors → rooms → beds), residents, bookings, payments, and occupancy.

**Core inventory model:** the **bed** is the atomic, bookable unit. Rooms and floors are organizational containers; a room of 3 beds can have 3 independent occupants with 3 independent bookings, durations, and check-in/check-out dates.

**Tech stack (assumed for this plan):**

- Next.js 16 (App Router, Server Actions, Route Handlers) + React 19
- TypeScript, Tailwind CSS v4
- PostgreSQL 16+ (required for `daterange` + GiST exclusion constraints used in overlap prevention)
- Drizzle ORM (type-safe SQL, plays well with Postgres range types)
- NextAuth/Auth.js for customer + admin auth (separate role scopes)
- Razorpay (primary) / Stripe (fallback) for online payments
- Resend (transactional email) + Twilio (SMS / WhatsApp OTP)
- Vercel for hosting, Neon/Supabase/RDS for Postgres

---

## 2. Database Architecture

### 2.1 Design Principles

1. **Bed is the inventory unit.** Every reservation row points at exactly one `bed_id`. Multi-bed bookings are modeled as a parent `booking` with N `bed_reservations`.
2. **Overlap prevention is enforced in the database**, not just in app code. We use a Postgres `daterange` column plus a GiST `EXCLUDE` constraint so two active reservations for the same bed can never overlap, no matter how the booking endpoint is called (race conditions, retries, admin overrides).
3. **Future reservations are first-class.** A `bed_reservation` simply carries a `[start_date, end_date)` range; "now" is irrelevant to storage. The same shape handles current stays, advance bookings, and historical records.
4. **Stay extensions are append-only.** Extending a stay does not mutate the original reservation; it creates a new contiguous `bed_reservation` linked to the same booking, which the overlap constraint validates automatically.
5. **Pricing is decoupled from inventory.** A `bed_price` row attaches daily / weekly / monthly rates (and optional promotional overrides) to a bed (or, by inheritance, to a room/PG default). The quoted price for a booking is **snapshotted** onto the booking at the time of creation so historical bills stay correct when rates change.
6. **Money is integers.** All amounts are stored in paise (`bigint`) to avoid float drift.
7. **Soft-delete via `archived_at`** for inventory entities (PG, floor, room, bed) so historical bookings/payments remain referentially intact.

### 2.2 Entity Relationship (high level)

```
pgs ──< floors ──< rooms ──< beds ──< bed_reservations >── bookings >── customers
                                  \                            │
                                   └── bed_prices              ├──< payments
                                                               └──< stay_extensions
room_types ──< rooms
admin_users, audit_log, sessions (cross-cutting)
```

### 2.3 Tables

> Conventions: every table has `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz`. Soft-deletable tables add `archived_at timestamptz null`.

#### `pgs`
| column | type | notes |
| --- | --- | --- |
| `id` | uuid | pk |
| `name` | text | "Awesome PG — Koramangala" |
| `slug` | text unique | URL-safe |
| `address_line1` | text | |
| `address_line2` | text null | |
| `city` | text | |
| `state` | text | |
| `pincode` | text | |
| `geo_lat`, `geo_lng` | numeric(9,6) null | for map view |
| `gender_policy` | enum(`male`,`female`,`coed`) | |
| `amenities` | jsonb | wifi, food, laundry, parking, ac… |
| `images` | jsonb (array of urls) | hero + gallery |
| `description` | text | |
| `is_active` | boolean default true | |
| `archived_at` | timestamptz null | |

#### `floors`
| column | type | notes |
| --- | --- | --- |
| `id` | uuid | pk |
| `pg_id` | uuid fk → pgs | cascade restrict |
| `floor_number` | int | 0 = ground |
| `label` | text null | "Ground", "Mezzanine" |
| `archived_at` | timestamptz null | |
| **unique** | `(pg_id, floor_number)` | |

#### `room_types`
| column | type | notes |
| --- | --- | --- |
| `id` | uuid | pk |
| `pg_id` | uuid fk → pgs null | nullable allows global templates |
| `name` | text | "Single AC", "Triple Sharing Non-AC" |
| `default_capacity` | int | informational |
| `has_ac` | boolean | |
| `has_attached_bath` | boolean | |
| `default_amenities` | jsonb | |

#### `rooms`
| column | type | notes |
| --- | --- | --- |
| `id` | uuid | pk |
| `floor_id` | uuid fk → floors | |
| `room_type_id` | uuid fk → room_types | |
| `room_number` | text | "G-12", "203-A" |
| `notes` | text null | |
| `archived_at` | timestamptz null | |
| **unique** | `(floor_id, room_number)` | |

#### `beds`  ← **primary inventory**
| column | type | notes |
| --- | --- | --- |
| `id` | uuid | pk |
| `room_id` | uuid fk → rooms | |
| `bed_code` | text | "B1", "Window", "Upper-Bunk" |
| `status` | enum(`available`,`maintenance`,`blocked`) | "blocked" prevents future bookings without deleting history |
| `notes` | text null | |
| `archived_at` | timestamptz null | |
| **unique** | `(room_id, bed_code)` | |

#### `bed_prices`
Pricing is per-bed and time-versioned. To look up the price for a given date, pick the row with the latest `effective_from <= date` for the bed (or fall back to room/PG default via a view).

| column | type | notes |
| --- | --- | --- |
| `id` | uuid | pk |
| `bed_id` | uuid fk → beds | |
| `daily_rate_paise` | bigint | |
| `weekly_rate_paise` | bigint | |
| `monthly_rate_paise` | bigint | |
| `security_deposit_paise` | bigint | refundable, snapshotted on booking |
| `effective_from` | date | |
| `effective_to` | date null | null = open ended |
| **check** | one of the rates is > 0 | |
| **exclusion** | no overlapping `[effective_from, effective_to)` per `bed_id` | |

#### `customers`
| column | type | notes |
| --- | --- | --- |
| `id` | uuid | pk |
| `full_name` | text | |
| `email` | citext unique | |
| `phone` | text unique | E.164 |
| `gender` | enum(`male`,`female`,`other`) | enforced against `pgs.gender_policy` |
| `dob` | date null | |
| `id_proof_type` | enum(`aadhaar`,`passport`,`pan`,`dl`) null | |
| `id_proof_number` | text null | encrypted at rest |
| `id_proof_image_url` | text null | |
| `address` | jsonb null | permanent address |
| `emergency_contact` | jsonb null | name, phone, relation |
| `kyc_status` | enum(`pending`,`verified`,`rejected`) | |
| `auth_provider` | enum(`otp`,`google`,`email`) | |

#### `bookings`
A booking is the **customer-facing aggregate**. It bundles 1..N `bed_reservations`, the snapshotted price, and the payment lifecycle.

| column | type | notes |
| --- | --- | --- |
| `id` | uuid | pk |
| `booking_code` | text unique | human friendly e.g. `APG-2026-0001` |
| `customer_id` | uuid fk → customers | |
| `status` | enum(`draft`,`pending_payment`,`confirmed`,`cancelled`,`completed`,`refunded`) | |
| `duration_mode` | enum(`daily`,`weekly`,`monthly`,`open_ended`) | how rate was computed |
| `expected_checkout_date` | date null | null when `open_ended` |
| `subtotal_paise` | bigint | sum of all reservations |
| `discount_paise` | bigint default 0 | |
| `tax_paise` | bigint default 0 | |
| `total_paise` | bigint | snapshot |
| `deposit_paise` | bigint | snapshot |
| `pricing_snapshot` | jsonb | per-bed rate + computation used |
| `notes` | text null | |
| `created_via` | enum(`customer`,`admin`) | |
| `created_by_admin_id` | uuid fk → admin_users null | |
| `cancelled_at` | timestamptz null | |
| `cancellation_reason` | text null | |

#### `bed_reservations`  ← **overlap-protected**
This is where availability actually lives. One row = one bed held for one date range.

| column | type | notes |
| --- | --- | --- |
| `id` | uuid | pk |
| `booking_id` | uuid fk → bookings | cascade on cancel via app logic |
| `bed_id` | uuid fk → beds | |
| `stay_range` | `daterange` | `[check_in, check_out)` half-open |
| `kind` | enum(`primary`,`extension`) | extensions chain off the parent |
| `parent_reservation_id` | uuid fk → bed_reservations null | set when `kind = extension` |
| `status` | enum(`hold`,`active`,`cancelled`,`completed`) | `hold` while payment pending |
| `hold_expires_at` | timestamptz null | auto-release in cron |

**Constraints (the heart of the design):**

```sql
-- prevent two non-cancelled reservations on the same bed from overlapping
ALTER TABLE bed_reservations
  ADD CONSTRAINT no_overlap_per_bed
  EXCLUDE USING gist (
    bed_id WITH =,
    stay_range WITH &&
  ) WHERE (status IN ('hold','active'));
```

Indexes: `(bed_id, stay_range)` GiST; `(booking_id)`; partial on `status='hold'` for the expiry sweeper.

#### `stay_extensions`
A request log for extending a booking. The actual extra inventory lives in a new `bed_reservations` row of `kind='extension'`. This table tracks who asked, when, the quoted price, and whether it was approved/paid.

| column | type | notes |
| --- | --- | --- |
| `id` | uuid | pk |
| `booking_id` | uuid fk → bookings | |
| `requested_by` | enum(`customer`,`admin`) | |
| `requested_until_date` | date | new desired end date |
| `extension_duration_mode` | enum(`daily`,`weekly`,`monthly`) | |
| `quoted_total_paise` | bigint | |
| `status` | enum(`pending`,`approved`,`paid`,`rejected`,`cancelled`) | |
| `new_reservation_ids` | uuid[] | reservations created on approval |
| `payment_id` | uuid fk → payments null | |

#### `payments`
| column | type | notes |
| --- | --- | --- |
| `id` | uuid | pk |
| `booking_id` | uuid fk → bookings | |
| `purpose` | enum(`booking`,`extension`,`deposit`,`refund`,`adjustment`) | |
| `provider` | enum(`razorpay`,`stripe`,`cash`,`upi_manual`,`bank_transfer`) | |
| `provider_payment_id` | text null | external id |
| `provider_order_id` | text null | |
| `amount_paise` | bigint | negative for refunds |
| `currency` | text default `'INR'` | |
| `status` | enum(`initiated`,`succeeded`,`failed`,`refunded`,`partially_refunded`) | |
| `raw_payload` | jsonb null | webhook body for audit |
| `paid_at` | timestamptz null | |

#### `admin_users`
| column | type | notes |
| --- | --- | --- |
| `id` | uuid | pk |
| `full_name` | text | |
| `email` | citext unique | |
| `password_hash` | text | bcrypt/argon2 |
| `role` | enum(`super_admin`,`pg_manager`,`accountant`,`viewer`) | |
| `pg_scope` | uuid[] | which PGs this admin can manage; empty = all (super) |
| `is_active` | boolean default true | |

#### `audit_log`
| column | type | notes |
| --- | --- | --- |
| `id` | uuid | pk |
| `actor_type` | enum(`customer`,`admin`,`system`) | |
| `actor_id` | uuid null | |
| `entity` | text | "booking", "bed" |
| `entity_id` | uuid | |
| `action` | text | "create", "cancel", "extend" |
| `diff` | jsonb | before/after snapshot |
| `ip`, `user_agent` | text null | |

#### `sessions`, `verification_tokens`, `accounts`
Standard Auth.js tables for customer + admin sessions.

### 2.4 Helper Views

- `v_bed_availability(bed_id, date)` — set-returning function or view that yields `(bed_id, date, is_available, reservation_id?)` for a given date window. Powers the calendar.
- `v_pg_occupancy(pg_id, date)` — `(total_beds, occupied_beds, occupancy_pct)`.
- `v_active_residents(pg_id)` — joins `bed_reservations` (`status='active'` and today `<@ stay_range`) → bookings → customers.

### 2.5 Key Algorithms

**Quote a price** (given `bed_id`, `start`, `end`, `mode`):

1. Fetch the active `bed_prices` row(s) covering `[start, end)`.
2. Compute nights = `end - start`.
3. By `mode`:
   - `daily` → `nights * daily_rate`
   - `weekly` → `ceil(nights/7) * weekly_rate`
   - `monthly` → `months_between(start, end) * monthly_rate` with pro-rata daily for partial month
   - `open_ended` → bill monthly with no `end` cap; bookings have rolling monthly invoices
4. Add deposit on first booking. Snapshot the breakdown into `bookings.pricing_snapshot`.

**Create a multi-bed booking (transactional):**

1. `BEGIN`.
2. Insert `bookings` row in `draft`.
3. For each selected bed, insert a `bed_reservations` row with `status='hold'`, `hold_expires_at = now() + interval '15 minutes'`. If the EXCLUDE constraint fires, return a 409 with the conflicting bed.
4. Move booking to `pending_payment`, return payment intent.
5. On payment success webhook: flip all reservations to `active`, booking to `confirmed`.
6. A cron job sweeps `hold` reservations past `hold_expires_at` → `cancelled` and frees inventory.

**Extend a stay:**

1. Customer/admin picks a `requested_until_date` for an existing booking.
2. For each `bed_id` in the booking, attempt to insert a new `bed_reservations` row `(bed_id, [old_end, new_end), kind='extension', parent=original)`.
3. If any insert violates EXCLUDE → reject extension with the conflicting bed/date.
4. Otherwise: create `stay_extensions` row `pending`, generate payment.
5. On payment success: reservations flip `hold → active`; extension row → `paid`; booking's `expected_checkout_date` updated.

---

## 3. Folder Architecture

Next.js 16 App Router with route groups to cleanly separate customer and admin surfaces, plus a `src/`-style layout for non-routable code.

```
awesomepg/
├── app/                              # App Router (routable code only)
│   ├── (marketing)/                  # public landing
│   │   ├── page.tsx                  # home
│   │   └── about/page.tsx
│   ├── (customer)/                   # public booking flow
│   │   ├── layout.tsx                # customer chrome
│   │   ├── pgs/
│   │   │   ├── page.tsx              # list / search PGs
│   │   │   └── [pgSlug]/
│   │   │       ├── page.tsx          # PG detail + room types
│   │   │       ├── rooms/[roomId]/page.tsx     # bed map for a room
│   │   │       └── availability/page.tsx       # calendar across the PG
│   │   ├── booking/
│   │   │   ├── new/page.tsx          # cart: chosen beds, dates, duration
│   │   │   ├── [bookingCode]/page.tsx           # confirmation / status
│   │   │   └── [bookingCode]/extend/page.tsx    # extension flow
│   │   └── account/
│   │       ├── page.tsx              # profile, KYC
│   │       ├── bookings/page.tsx     # my bookings
│   │       └── payments/page.tsx
│   ├── (admin)/                      # admin console (auth-gated layout)
│   │   ├── layout.tsx
│   │   ├── admin/
│   │   │   ├── page.tsx              # dashboard / occupancy
│   │   │   ├── pgs/                  # CRUD
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [pgId]/
│   │   │   │       ├── page.tsx
│   │   │   │       ├── floors/...
│   │   │   │       ├── rooms/...
│   │   │   │       └── beds/...
│   │   │   ├── residents/page.tsx
│   │   │   ├── bookings/
│   │   │   │   ├── page.tsx          # list/filter
│   │   │   │   ├── new/page.tsx      # admin-created booking
│   │   │   │   └── [bookingId]/page.tsx
│   │   │   ├── payments/page.tsx
│   │   │   ├── occupancy/page.tsx    # heatmap + reports
│   │   │   ├── pricing/page.tsx      # bed_price editor
│   │   │   └── settings/page.tsx
│   ├── api/                          # Route Handlers (webhooks, public JSON)
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── webhooks/
│   │   │   ├── razorpay/route.ts
│   │   │   └── stripe/route.ts
│   │   └── availability/route.ts     # cached read API
│   ├── layout.tsx
│   ├── globals.css
│   └── not-found.tsx
│
├── src/
│   ├── db/
│   │   ├── schema/                   # Drizzle schema, one file per table
│   │   │   ├── pgs.ts
│   │   │   ├── floors.ts
│   │   │   ├── rooms.ts
│   │   │   ├── beds.ts
│   │   │   ├── bookings.ts
│   │   │   ├── bedReservations.ts
│   │   │   ├── payments.ts
│   │   │   └── index.ts
│   │   ├── migrations/               # generated SQL
│   │   ├── client.ts                 # drizzle client singleton
│   │   └── seed.ts                   # dev fixtures
│   ├── services/                     # business logic (pure, testable)
│   │   ├── availability.ts
│   │   ├── pricing.ts
│   │   ├── booking.ts                # create / cancel / hold-sweep
│   │   ├── extension.ts
│   │   ├── payments.ts               # razorpay/stripe adapters
│   │   ├── occupancy.ts
│   │   └── kyc.ts
│   ├── actions/                      # Next.js Server Actions
│   │   ├── customer/
│   │   │   ├── createBooking.ts
│   │   │   ├── extendBooking.ts
│   │   │   └── cancelBooking.ts
│   │   └── admin/
│   │       ├── upsertPg.ts
│   │       ├── upsertBed.ts
│   │       ├── adjustPricing.ts
│   │       └── recordCashPayment.ts
│   ├── auth/
│   │   ├── customer.ts               # auth.js config
│   │   ├── admin.ts
│   │   └── guards.ts                 # role/scope helpers
│   ├── components/
│   │   ├── ui/                       # primitives (Button, Dialog, Calendar)
│   │   ├── customer/                 # PgCard, BedMap, BookingCart, …
│   │   └── admin/                    # DataTable, OccupancyHeatmap, …
│   ├── lib/
│   │   ├── dates.ts                  # date math (Luxon/Temporal)
│   │   ├── money.ts                  # paise <-> rupees
│   │   ├── ids.ts                    # booking_code generator
│   │   ├── env.ts                    # zod-validated env
│   │   ├── logger.ts
│   │   └── http.ts
│   ├── jobs/                         # background workers
│   │   ├── releaseExpiredHolds.ts
│   │   ├── sendBookingReminders.ts
│   │   └── generateMonthlyInvoices.ts
│   ├── emails/                       # react-email templates
│   │   ├── BookingConfirmation.tsx
│   │   └── ExtensionInvoice.tsx
│   └── types/
│       ├── domain.ts                 # shared TS types
│       └── api.ts
│
├── tests/
│   ├── unit/services/
│   ├── integration/db/               # spins up postgres, validates EXCLUDE
│   └── e2e/                          # Playwright: book, pay (stubbed), extend
│
├── public/
├── scripts/
│   ├── db-reset.ts
│   └── backfill-pricing.ts
├── drizzle.config.ts
├── PROJECT_PLAN.md                   # this file
├── README.md
├── AGENTS.md / CLAUDE.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── eslint.config.mjs
└── postcss.config.mjs
```

**Conventions:**

- All DB writes go through `src/services/*`. Route handlers and server actions are thin adapters.
- `src/services/*` never imports React. `src/actions/*` and `app/**` never write SQL directly.
- All money in paise, all dates as ISO `YYYY-MM-DD` for dates and `timestamptz` for instants.
- Zod schemas live next to the action they validate, exported for shared client/server use.

---

## 4. User (Customer) Flows

### 4.1 Discover a PG
```
Landing  →  /pgs  (filters: city, gender, budget, amenities)
        →  /pgs/[slug]   (PG hero, amenities, gallery, room types, "View beds")
```

### 4.2 Browse availability
```
/pgs/[slug]                       (room-type cards: "3 beds available from 2026-06-01")
   → /pgs/[slug]/rooms/[roomId]   (bed map: each bed shows next-available date)
   → click bed                    (calendar of free / booked dates for that bed)
   → "Add to booking" (multi-select beds + a single date range)
```

Future availability dates are computed by `availability.ts` (queries `bed_reservations` and returns the next N free windows per bed).

### 4.3 Book one or more beds
```
Cart (/booking/new)
   - List of selected beds with per-bed daily/weekly/monthly options
   - Duration picker:  Daily | Weekly | Monthly | Open-ended
   - Date range (start required; end required unless Open-ended)
   - Live price quote (calls /api/quote)
   - Sign in / sign up (phone OTP)
   - KYC upload (can be deferred to before check-in based on PG policy)
   - "Pay & confirm"  →  Razorpay checkout
   - On success      →  /booking/[code]  (confirmation, receipt, house rules)
```

Booking is **held** for 15 minutes during payment. On webhook success the holds flip to `active`. If payment fails or times out, the cron releases them.

### 4.4 Manage bookings
```
/account/bookings
   - Upcoming / Active / Past tabs
   - For each booking:
       View receipt  |  Download invoice  |  Extend stay  |  Cancel (per policy)
```

### 4.5 Extend a stay
```
/booking/[code]/extend
   - Show current end date and per-bed availability beyond it
   - Pick new end date + duration mode
   - System checks each bed (atomic insert vs EXCLUDE)
       - If any bed conflicts: show which bed/date blocks it and suggest
         "release that bed" or "pick a shorter extension"
   - Quote → pay → confirm
```

### 4.6 Pay online / repay
```
Any unpaid invoice (initial or extension or monthly for open-ended)
   → Razorpay order  → webhook  → payment row updated
   → email + SMS receipt
```

### 4.7 Cancel / refund
- Customer-initiated cancellation follows the PG's policy snapshot stored on the booking (e.g. full refund > 7 days out, 50% within 48h).
- Refund creates a negative `payments` row tied to the original.

---

## 5. Admin Flows

### 5.1 Sign in
- Admin login at `/admin/login` (separate from customer Auth.js scope).
- Role gates: `super_admin` (everything), `pg_manager` (only PGs in `pg_scope`), `accountant` (read + payments), `viewer` (read-only).

### 5.2 Inventory CRUD
```
Dashboard (occupancy snapshot)
   → PGs  (create / edit / archive)
       → Floors  (add floor, label, soft-delete)
           → Rooms  (assign room_type, room_number)
               → Beds  (bed_code, status, notes)
                   → Bed pricing (effective_from windows, daily/weekly/monthly)
```

Each level shows live occupancy and outstanding bookings to prevent accidental archiving of inventory with active residents.

### 5.3 Manage residents
- Search by name / phone / booking code.
- View KYC documents, approve / reject.
- See residency history (which beds, what dates).
- Manual notes (incidents, dues).

### 5.4 Manage bookings
- Filter by PG, status, date range, customer.
- Create a booking on behalf of a walk-in customer (`created_via='admin'`).
- Move a resident to a different bed (creates a new reservation + closes the old one in a single transaction; constraint protects against conflicts).
- Cancel with refund decision.
- Override / waive a price (audit-logged).

### 5.5 Manage payments
- View all payments with provider + status.
- Record offline payments (cash / UPI / bank transfer) — creates a `payments` row with `provider='cash'`.
- Issue refunds (Razorpay refund API + negative payment row).
- Reconcile (mark provider payouts).

### 5.6 Occupancy & reporting
- Daily occupancy % per PG / floor / room-type.
- Heatmap calendar (next 90 days).
- Revenue by month, by PG, by duration mode.
- Upcoming check-outs / check-ins for the next 7 days.
- Vacant beds list with "first vacant date" for sales follow-ups.

### 5.7 Settings
- PG-level: cancellation policy, hold duration, deposit policy, gender policy.
- System-level: payment provider keys, tax rates, email/SMS templates.
- Admin user management (super_admin only).

---

## 6. Feature List

### 6.1 Customer

| # | Feature | MVP |
| - | --- | --- |
| C1 | Browse PGs with filters (city, gender, budget, amenities) | ✓ |
| C2 | PG detail page (gallery, amenities, location map) | ✓ |
| C3 | Room-level view with available bed count | ✓ |
| C4 | Bed-level view with per-bed availability calendar | ✓ |
| C5 | Multi-bed selection (book 2+ beds in one booking) | ✓ |
| C6 | Duration picker: daily / weekly / monthly / open-ended | ✓ |
| C7 | Future date booking with date-range picker | ✓ |
| C8 | Live price quote (mode-aware) | ✓ |
| C9 | Phone-OTP signup & login | ✓ |
| C10 | KYC document upload (Aadhaar/PAN/DL/Passport) | ✓ |
| C11 | Online payment via Razorpay (UPI, card, netbanking) | ✓ |
| C12 | Booking confirmation email + SMS | ✓ |
| C13 | My Bookings dashboard | ✓ |
| C14 | Stay extension request + payment | ✓ |
| C15 | Cancellation per policy | ✓ |
| C16 | Download GST invoice | ✓ |
| C17 | Saved payment methods | ▢ |
| C18 | Roommate preferences / requests | ▢ |
| C19 | In-app complaint / ticket | ▢ |
| C20 | Referral program | ▢ |

### 6.2 Admin

| # | Feature | MVP |
| - | --- | --- |
| A1 | Admin auth with roles (super/pg_manager/accountant/viewer) | ✓ |
| A2 | Multi-PG management with `pg_scope` enforcement | ✓ |
| A3 | Floors, rooms, room-types CRUD | ✓ |
| A4 | Bed CRUD with status (available/maintenance/blocked) | ✓ |
| A5 | Time-versioned bed pricing editor | ✓ |
| A6 | Resident directory with KYC review | ✓ |
| A7 | Booking list / detail / admin-created bookings | ✓ |
| A8 | Move resident across beds (transactional) | ✓ |
| A9 | Cancellation + refund workflow | ✓ |
| A10 | Payment ledger + offline payment recording | ✓ |
| A11 | Occupancy dashboard + heatmap | ✓ |
| A12 | Upcoming check-in / check-out list | ✓ |
| A13 | Revenue reports (by PG, month, duration) | ✓ |
| A14 | Audit log viewer | ✓ |
| A15 | Bulk import of inventory (CSV) | ▢ |
| A16 | Auto-generated monthly invoices for open-ended stays | ✓ |
| A17 | Hold-expiry sweeper (cron) | ✓ |
| A18 | Razorpay/Stripe webhook handler with retry idempotency | ✓ |
| A19 | Email/SMS template editor | ▢ |
| A20 | Export to accounting software (Tally/Zoho) | ▢ |

### 6.3 Cross-cutting / Platform

- Strict overlap prevention via Postgres `EXCLUDE USING gist`.
- Idempotent payment webhooks.
- Background jobs (cron) for: hold expiry, monthly invoicing for open-ended, reminders (T-3 day check-in, T-3 day stay-end), KYC nudges.
- Structured logging + audit log on every write.
- Rate limiting on quote/booking endpoints.
- Image uploads via S3 + CDN.
- Responsive UI (mobile-first); PWA install for residents.
- i18n scaffold (EN + HI to start).
- Accessibility (WCAG 2.1 AA).

---

## 7. Development Phases

Each phase ends with a demoable slice and a test bar. Estimates assume one full-stack developer; parallelize as the team grows.

### Phase 0 — Foundations (week 1)
- Provision Postgres (Neon), set up Drizzle, env validation, CI.
- Auth.js with two scopes (customer phone-OTP, admin email/password).
- Tailwind v4 base theme + UI primitives.
- Bare layouts for `(customer)`, `(admin)`, `(marketing)`.
- **Exit:** `npm run dev` works; admin & customer can sign in; CI green.

### Phase 1 — Inventory Domain (week 2)
- All schema tables, migrations, seed script for 1 PG / 3 floors / 12 rooms / 30 beds.
- Admin CRUD pages for PG → Floor → Room → Bed.
- Soft-delete + audit log.
- **Exit:** an operator can model a real PG end-to-end in the admin console.

### Phase 2 — Pricing & Availability Engine (week 3)
- `bed_prices` table + admin editor with effective-date windows.
- `services/pricing.ts` with daily/weekly/monthly/open-ended math + tests.
- `services/availability.ts` with "free windows per bed" + tests.
- Public read API `/api/availability` + customer bed-map UI (no booking yet).
- **Exit:** customers can see, for any bed, the next N available date ranges.

### Phase 3 — Booking Core (weeks 4–5)
- `bed_reservations` table with the GiST EXCLUDE constraint.
- Hold → confirm state machine; transactional booking creation.
- Customer cart UI: multi-bed select, duration mode, date range, live quote.
- Booking confirmation page + email.
- Integration tests: concurrent booking attempts on the same bed → exactly one wins.
- **Exit:** customers can book one or many beds end-to-end with **no payment** (manual confirm).

### Phase 4 — Payments (week 6)
- Razorpay order creation + checkout SDK on client.
- Webhook handler (idempotent on `provider_payment_id`).
- Payment success → reservations flip to `active`, booking `confirmed`.
- Cancel / refund flow (admin + customer).
- Hold-expiry cron.
- **Exit:** full paid booking lifecycle in staging with Razorpay test mode.

### Phase 5 — Stay Extensions (week 7)
- `stay_extensions` table + service.
- Customer extension UI: pick new end date, see conflicts, pay.
- Admin can extend on behalf.
- Open-ended stays → monthly invoice cron.
- **Exit:** a resident can extend a confirmed stay (with payment) including across pricing changes.

### Phase 6 — Operations & Reporting (week 8)
- Occupancy dashboard, heatmap, check-in / check-out lists.
- Revenue reports by PG / month / duration mode.
- Resident directory + KYC review UI.
- Move-resident workflow.
- Audit-log viewer.
- **Exit:** operators can run daily ops entirely from the admin console.

### Phase 7 — Hardening & Launch (week 9)
- E2E test suite (Playwright) covering: browse → book → pay → extend → cancel.
- Load test the availability endpoint and the booking transaction.
- Backups + point-in-time recovery configured.
- Rate limiting, bot protection on auth.
- Accessibility audit, mobile QA, SEO basics for marketing pages.
- Production launch checklist (DNS, monitoring, on-call).
- **Exit:** live for Awesome PG's first location.

### Phase 8 — Post-launch Enhancements (ongoing)
- Bulk CSV inventory import.
- Roommate preferences / matching.
- Complaint / ticket module.
- Referral program.
- Tally / Zoho export.
- Native mobile shell (PWA → Capacitor).

---

## 8. Open Questions / Risks

1. **Pro-rata policy for monthly mode** — confirm with Awesome PG: do we bill calendar months or rolling 30-day windows? (affects `pricing.ts`).
2. **Deposit refund mechanics** — held against damages; need a `deposit_ledger` if we want partial refunds (deferred to post-MVP).
3. **GST / tax registration** — invoice format must match the operator's GSTIN setup.
4. **Gender-mixed rooms** — current schema enforces PG-level `gender_policy`; if room-level overrides are needed, add `rooms.gender_policy`.
5. **Multi-tenant (multiple PG operators on one deployment)** — schema can grow an `operator_id` later, but MVP assumes a single operator (Awesome PG).
6. **Race condition on extension across pricing change** — pricing is snapshotted at extension-quote time; if payment lands after a new `bed_prices` row activates, the snapshot still wins. Documented.

---

## 9. Definition of Done (per feature)

A feature is "done" when:

1. Schema migrations are reversible and applied to staging.
2. Service-layer logic has unit tests; DB-touching logic has integration tests.
3. Server actions validate inputs with Zod.
4. UI is responsive (≥ 360px) and keyboard-navigable.
5. Audit log entries are written for every mutating action.
6. The feature is exercised by a Playwright E2E test in the relevant flow.
7. Docs in `README.md` (or a `docs/` page) describe how to operate / debug it.

---

*End of plan. Implementation begins at Phase 0 once this document is signed off.*
