# Database Setup — Awesome PG

Phase 1 ships the full inventory + booking + payment schema (13 tables) along with the GiST-based overlap-prevention machinery that the rest of the system relies on. This document covers everything needed to stand the database up from a clean machine.

> **What's here:** Postgres + Drizzle ORM, schema, migrations, seed.
> **What's _not_ here yet:** authentication. That arrives in Phase 6.
> **Payments / cron operations:** see [`PHASE4_OPERATIONS.md`](./PHASE4_OPERATIONS.md).

---

## 1. Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| **PostgreSQL** | 16 or newer (18 tested) | We rely on `daterange`, `EXCLUDE USING gist`, and the `btree_gist` / `citext` / `pgcrypto` extensions. |
| **Node.js** | 20 LTS or newer | `tsx` runtime for migrate / seed scripts. |
| **npm** | bundled with Node | install deps and run package scripts. |

All Drizzle and driver dependencies (`drizzle-orm`, `drizzle-kit`, `postgres`, `tsx`, `dotenv`) are already in `package.json` — `npm install` is enough.

The required Postgres extensions (`pgcrypto`, `citext`, `btree_gist`) ship with the standard Postgres distribution; nothing extra to install on the OS side. The first migration runs `CREATE EXTENSION IF NOT EXISTS …` for each.

---

## 2. Provisioning a Postgres database

Pick whichever of these is easiest in your environment.

### Option A — Docker (recommended for local dev)

```bash
docker run --name awesomepg-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=awesomepg \
  -p 5432:5432 \
  -d postgres:16
```

### Option B — Homebrew (macOS)

```bash
brew install postgresql@16
brew services start postgresql@16
createdb awesomepg
```

### Option C — Managed (Neon / Supabase / RDS)

Create a Postgres 16+ database and grab its connection string. Make sure your role can create extensions (`pgcrypto`, `citext`, `btree_gist`) — most managed providers allow this for the database owner.

---

## 3. Configure environment variables

Copy the example file and fill in your `DATABASE_URL`:

```bash
cp .env.example .env
```

`.env` should end up looking like:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/awesomepg
DATABASE_POOL_MAX=10
```

The same `DATABASE_URL` is used by `drizzle.config.ts` (for `drizzle-kit` commands) and by the runtime client (`src/db/client.ts`) loaded by `migrate.ts` / `seed.ts`.

---

## 4. Run migrations

```bash
npm install         # only needed once
npm run db:migrate
```

You should see:

```
→ Running migrations from src/db/migrations …
✓ Migrations applied
```

The first time you run this, Postgres will emit several `NOTICE: trigger "…" does not exist, skipping` lines. That's expected — the `updated_at` trigger installer issues `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER` so it's safe to re-apply. They are informational, not errors.

### What gets applied

The migration files run in order:

1. **`0000_phase1_inventory.sql`** — enables the three Postgres extensions, then creates every enum, table, foreign key, and index. Total: 19 enums + 13 tables + all FKs + 22 indexes.
2. **`0001_constraints.sql`** — the constraints Drizzle's table builders can't express:
   - `bed_reservations_no_overlap_per_bed` — GiST `EXCLUDE` that makes two non-cancelled reservations on the same bed structurally unable to overlap. This is the heart of the system.
   - `bed_prices_no_overlap_per_bed` — same idea applied to time-versioned pricing windows.
   - `bed_reservations_parent_matches_kind` — primary vs extension chain invariants.
   - `bookings_money_non_negative` — guards report integrity.
   - `payments_amount_sign_matches_purpose` — refunds must be negative; everything else non-negative.
   - `set_updated_at()` trigger function + a trigger on every mutable table.
3. **`0002_phase4_payments.sql`** — adds the `'mock'` value to the `payment_provider` enum so the in-process mock adapter can write to `payments.provider` without masquerading as Razorpay.
4. **`0003_phase5_extension_indexes.sql`** — partial index on `bed_reservations.parent_reservation_id` to make extension-chain joins cheap. Phase 5 reuses the `stay_extensions` table and `reservation_kind`/`payment_purpose` enum variants already created in Phase 1; see [`PHASE5_OPERATIONS.md`](./PHASE5_OPERATIONS.md).
5. **`0004_phase5_5_resident_billing.sql`** — adds the Phase 5.5 resident-billing surface: four new enums (`rent_invoice_status`, `electricity_invoice_status`, `deposit_entry_kind`, `vacating_status`), three new values on `payment_purpose` (`rent`, `electricity`, `deposit_deduction`), and five new tables (`rent_invoices`, `electricity_bills`, `electricity_invoices`, `deposit_ledger`, `vacating_requests`) with their CHECK constraints, unique indexes, and `updated_at` triggers. See [`PHASE5_5_OPERATIONS.md`](./PHASE5_5_OPERATIONS.md).

---

## 5. Seed sample data

```bash
npm run db:seed
```

Expected output:

```
→ Seeding Phase 1 inventory…
  ✓ inserted pg "awesome-pg-koramangala" (id=…)
  ✓ inserted 6 room types
  ✓ floor 0 (Ground): 4 rooms seeded
  ✓ floor 1 (First): 4 rooms seeded
  ✓ floor 2 (Second): 4 rooms seeded
  ──────────────────────────────────────────
  ✓ totals: 1 pg, 3 floors, 12 rooms, 48 beds, 48 price rows
✓ Seed complete
```

### What gets seeded

| Entity | Count | Notes |
| --- | --- | --- |
| PG | 1 | `Awesome PG — Koramangala`, slug `awesome-pg-koramangala`, co-ed |
| Floors | 3 | Ground (0), First (1), Second (2) |
| Room types | 6 | Single AC, Double AC, Triple AC, Quad Non-AC, Six Non-AC, Eight Non-AC |
| Rooms | 12 | 4 per floor |
| Beds | **48** | One per occupant slot; mix below |
| Bed prices | 48 | One initial pricing row per bed, effective `2026-01-01` onward |

**Bed distribution** (total: 48)

```
Floor 0 (Ground):  G-01 single(1)  G-02 double(2)  G-03 triple(3)  G-04 quad(4)         = 10
Floor 1 (First):   101  single(1)  102  double(2)  103   six(6)    104   eight(8)       = 17
Floor 2 (Second):  201  triple(3)  202  quad(4)    203   six(6)    204   eight(8)       = 21
                                                                                    ─────
                                                                                       48
```

**Pricing tiers** (rates stored in paise, displayed here as ₹)

| Room type | Daily | Weekly | Monthly | Deposit |
| --- | ---:| ---:| ---:| ---:|
| Single AC | ₹1,500 | ₹9,000 | ₹25,000 | ₹25,000 |
| Double Sharing AC | ₹1,000 | ₹6,000 | ₹18,000 | ₹18,000 |
| Triple Sharing AC | ₹800 | ₹4,500 | ₹14,000 | ₹14,000 |
| Quad Sharing Non-AC | ₹600 | ₹3,500 | ₹11,000 | ₹11,000 |
| Six Sharing Non-AC | ₹450 | ₹2,500 | ₹8,000 | ₹8,000 |
| Eight Sharing Non-AC | ₹350 | ₹2,000 | ₹6,500 | ₹6,500 |

### Idempotency

The seed checks for the PG slug first and bails out cleanly if it's already there. Running it twice never duplicates inventory — you'll just see:

```
  skip: PG with slug "awesome-pg-koramangala" already exists. Nothing to do.
```

To re-seed from scratch, see "Resetting the database" below.

---

## 6. NPM scripts cheat-sheet

| Script | What it does |
| --- | --- |
| `npm run db:generate` | Run `drizzle-kit generate` to produce a new migration after schema changes. Use `--name=my_change` to label it. Use `--custom` to create a hand-written SQL migration. |
| `npm run db:migrate` | Apply all pending migrations against `DATABASE_URL`. |
| `npm run db:seed` | Insert Phase 1 inventory. Idempotent. |
| `npm run db:reset` | Drop & recreate the `public` schema. Refuses to run with `NODE_ENV=production` unless `ALLOW_PROD_RESET=true`. Follow with `db:migrate` + `db:seed`. |
| `npm run db:studio` | Launch Drizzle Studio — a browser-based table inspector at <https://local.drizzle.studio>. |

---

## 7. Verifying the install

After `db:migrate && db:seed`, these queries should all return the expected counts:

```sql
SELECT 'pgs',        count(*) FROM pgs        -- 1
UNION ALL SELECT 'floors',     count(*) FROM floors      -- 3
UNION ALL SELECT 'room_types', count(*) FROM room_types  -- 6
UNION ALL SELECT 'rooms',      count(*) FROM rooms       -- 12
UNION ALL SELECT 'beds',       count(*) FROM beds        -- 48
UNION ALL SELECT 'bed_prices', count(*) FROM bed_prices; -- 48
```

And to convince yourself the overlap constraint is live, this transaction should error on the second insert:

```sql
BEGIN;
-- create a throwaway customer + booking ...
INSERT INTO customers (full_name, email, phone, gender)
  VALUES ('Smoke Test', 'smoke@example.com', '+910000000000', 'male') RETURNING id \gset cust_
INSERT INTO bookings (booking_code, customer_id, duration_mode, status)
  VALUES ('SMOKE-1', :'cust_id', 'daily', 'confirmed') RETURNING id \gset bkg_
SELECT id FROM beds LIMIT 1 \gset bed_

INSERT INTO bed_reservations (booking_id, bed_id, stay_range, kind, status)
  VALUES (:'bkg_id', :'bed_id', daterange('2026-06-01','2026-06-10','[)'), 'primary', 'active');
-- this MUST fail with: violates exclusion constraint "bed_reservations_no_overlap_per_bed"
INSERT INTO bed_reservations (booking_id, bed_id, stay_range, kind, status)
  VALUES (:'bkg_id', :'bed_id', daterange('2026-06-05','2026-06-15','[)'), 'primary', 'active');
ROLLBACK;
```

Adjacent ranges like `[2026-06-01,2026-06-10)` and `[2026-06-10,2026-06-20)` are accepted — that's the half-open convention working as designed, so back-to-back residents can transition without a vacant day.

---

## 8. Resetting the database (dev only)

```bash
npm run db:reset    # drops public schema; refuses in production
npm run db:migrate
npm run db:seed
```

This is the canonical "start fresh" sequence.

---

## 9. File layout

```
src/
├── lib/
│   └── env.ts                          # validated env vars (DATABASE_URL …)
└── db/
    ├── client.ts                       # postgres-js + Drizzle client factory
    ├── migrate.ts                      # npm run db:migrate entrypoint
    ├── reset.ts                        # npm run db:reset entrypoint
    ├── seed.ts                         # npm run db:seed entrypoint
    ├── schema/
    │   ├── index.ts                    # barrel
    │   ├── enums.ts                    # 19 pgEnum definitions
    │   ├── customTypes.ts              # citext + daterange Drizzle types
    │   ├── pgs.ts
    │   ├── floors.ts
    │   ├── roomTypes.ts
    │   ├── rooms.ts
    │   ├── beds.ts
    │   ├── bedPrices.ts
    │   ├── customers.ts
    │   ├── adminUsers.ts
    │   ├── bookings.ts
    │   ├── bedReservations.ts
    │   ├── stayExtensions.ts
    │   ├── payments.ts
    │   └── auditLog.ts
    └── migrations/
        ├── _journal.json
        ├── 0000_phase1_inventory.sql   # extensions + tables + FKs + indexes
        ├── 0001_constraints.sql        # GiST EXCLUDE + check constraints + triggers
        └── meta/
            ├── 0000_snapshot.json
            └── 0001_snapshot.json

drizzle.config.ts                       # drizzle-kit config (dialect, schema, out)
.env.example                            # template — copy to .env
```

---

## 10. Troubleshooting

**`ERROR: extension "btree_gist" is not available`** — your Postgres install is missing `contrib`. On Debian/Ubuntu: `apt install postgresql-contrib-16`. Stock Docker and Homebrew Postgres images already include it.

**`ERROR: permission denied to create extension`** — the role in `DATABASE_URL` isn't the database owner. On managed providers (Supabase, Neon) use the default `postgres`-equivalent role for the migrate step.

**`FATAL: postmaster became multithreaded during startup` (Homebrew Postgres 18 on macOS)** — set `LC_ALL=C` before `pg_ctl start`. Doesn't affect the schema or seed.

**`ENOENT: src/db/migrations/_journal.json`** — drizzle-kit hasn't generated the migrations folder yet. Run `npm run db:generate` first.

**Migrations apply but seed says it skipped** — the seed is idempotent; you've already seeded. Use `npm run db:reset && npm run db:migrate && npm run db:seed` to start over.

---

## 11. What's next (out of scope for Phase 1)

The schema, constraints, and seed are now in place. Future phases will add:

- Phase 2: pricing & availability services that read this data.
- Phase 3: booking service that writes `bed_reservations` (and proves under load that the EXCLUDE constraint stops overlap).
- Phase 4+: payments, extensions, admin UI, customer UI, auth.

Nothing in those phases requires schema changes that aren't additive — the contract this document describes is stable.
