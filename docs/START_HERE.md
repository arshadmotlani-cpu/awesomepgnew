# START HERE — Awesome PG

> **Single entry point for any AI system.** Read this file first, then follow links depth-first as needed.  
> Obsidian vault root: open the `docs/` folder with [[README]] as the graph index.

---

## 1. Project summary

**Awesome PG** is a production SaaS for managing paying-guest (PG) accommodations in India. It replaces spreadsheets and WhatsApp with one system for:

- Public discovery, booking, and payments (Razorpay + UPI proof)
- Resident accounts (wallet, rent, electricity, vacating, requests)
- Admin operations across multiple properties (inventory, billing, KYC, move-out, refunds)

**Production:** [awesomepg.in](https://awesomepg.in) on Vercel · PostgreSQL · Drizzle ORM · Next.js 16 App Router · React 19.

**Business goal:** Inventory, money, and move-out/refund workflows stay consistent — one source of truth per domain.

---

## Local development setup

Database configuration uses one resolver: `src/lib/db/env.ts` (priority: `DATABASE_URL` → `POSTGRES_URL` → `POSTGRES_PRISMA_URL`). Scripts auto-load `.env.local` then `.env` via `src/lib/db/loadEnv.ts`.

```bash
npm install
cp .env.example .env              # local Postgres URL — edit if needed
npx vercel link
npm run env:pull                  # non-DB vars → .env.local
npm run env:check                 # Neon: paste DATABASE_URL into .env.local first
npm run db:migrate
npm run dev
```

Verify configuration anytime: `npm run env:check`.

**Note:** Vercel’s default `vercel env pull .env.local` uses the **Development** environment, which may not include `DATABASE_URL`. Use `npm run env:pull` (Preview) for integration metadata, then set `DATABASE_URL` in `.env` (local Postgres from `.env.example`) or paste your Neon connection string into `.env.local`. Run `npm run env:check` to verify. See [[DATABASE#Environment & migrations]].

---

## 2. Current status

> Detail: [[CURRENT_STATE]] · History: [[CHANGELOG]] · Issues: [[BUGS]]

| Area | Status (2026-06-21) |
|------|---------------------|
| Core booking + billing | ✅ Production |
| KYC + bed assignment | ✅ Production (SSOT aligned `88a16e8`) |
| Vacating + checkout settlements | ✅ Production |
| Checkout-month rent sync on notice | ✅ Shipped `369bddb` |
| `/admin/vacating` Date crash | ✅ Fixed `d4c01c6` — verify post-deploy |
| Operations move-out queue | ✅ Fixed deep links + `customerId` `d4c01c6` |
| Admin UX consolidation | 🔄 In progress — reduce duplicate CTAs |
| Documentation second brain | ✅ This vault + pre-commit sync |

**Active ops scenarios:** Pending move-out approvals (e.g. Mohd Aatif) · Checkout settlements in progress (e.g. Harish). See [[BUGS]] and [[CURRENT_STATE#Current priority]].

---

## 3. Architecture overview

> Full detail: [[ARCHITECTURE]] · Schema: [[DATABASE]] · Routes: [[ROUTES]]

```
Browser (public / account / admin)
        ↓  RSC + Server Actions + API
Presentation (app/, src/components/)
        ↓
Services (src/services/*.ts)  ← business SSOT
        ↓  Drizzle ORM
PostgreSQL
```

**Non-negotiable SSOT services:**

| Domain | Service |
|--------|---------|
| All resident money figures | `residentFinancialEngine.ts` |
| Rent | `rentInvoices.ts`, `billing.ts`, `vacatingCheckoutBilling.ts` |
| Electricity | `electricityBilling.ts`, `meterElectricity.ts` |
| Deposits | `deposits.ts`, `depositOperations.ts` |
| Vacating / refund | `vacating.ts`, `checkoutSettlement.ts` |
| Bed occupancy | `occupancySsot.ts`, `bed_reservations` |
| Operator queue | `residentOperationsDashboard.ts`, `actionItems.ts` |
| Unified invoices | `unifiedInvoices.ts` |

**Never duplicate financial math in UI.** Never pass `Date` or `Map` from RSC to client components — serialize first ([[DECISIONS#Client Date serialization]]).

---

## 4. Important business rules

> ADR log: [[DECISIONS]] · Flows: [[WORKFLOWS]]

1. **Half-open stays:** `bed_reservations.stay_range` is `[check_in, check_out)` — last occupied day = end − 1 day ([[DECISIONS#Half-open stay ranges]]).
2. **Pricing snapshot:** `bookings.pricing_snapshot` is frozen at checkout — never mutate for historical billing ([[DECISIONS#Pricing snapshot immutability]]).
3. **Vacating notice:** ≥14 days → no deposit deduction; &lt;14 days → exactly 5 days rent deducted (snapshotted at submit).
4. **Checkout-month rent:** On vacating submit/approve, pro-rate move-out month and cancel future rent invoices ([[DECISIONS#Vacating checkout rent sync]]).
5. **Split vacate vs refund:** Resident files notice first; meter + UPI refund only after admin approval **and** vacate date reached ([[DECISIONS#Split vacate request from deposit refund]]).
6. **Refund SSOT:** All move-out refunds via `checkout_settlements` — not legacy `/admin/requests` ([[DECISIONS#Checkout settlements as refund SSOT]]).
7. **Operations hub:** Primary operator actions live in [[Operations]] — profile/bed map are drill-down, not duplicate action surfaces ([[DECISIONS#Operations as action hub]]).
8. **Bed assignment:** Bed map and residents list must use the same occupancy predicates ([[DECISIONS#Bed assignment SSOT alignment]]).
9. **Documentation:** Any code change updates [[CHANGELOG]] + affected brain docs; pre-commit hook assists ([[README#Pre-commit doc sync (automatic)]]).

---

## 5. Active priorities

From [[CURRENT_STATE]]:

1. **Stabilize vacating / checkout ops** — end-to-end after `d4c01c6` deploy.
2. **Approve pending move-outs** — residents with notice filed but not approved.
3. **Complete checkout settlements** — approved vacates awaiting meter/refund/payout.
4. **Consolidate admin actions** — [[Operations]], [[Billing]], [[Vacating]], checkout settlements only.

---

## 6. Links to all major documents

### Core brain (read in order for deep onboarding)

| # | Document | Purpose |
|---|----------|---------|
| 1 | [[START_HERE]] | This file — always start here |
| 2 | [[active_memory]] | Live focus + top priorities |
| 3 | [[AI_CONTEXT]] | Rules, SSOT map, memory classification |
| 3 | [[CURRENT_STATE]] | Priorities, completed systems, debt |
| 4 | [[HANDOVER]] | Paste-ready brief for any AI session |
| 5 | [[features]] | Full feature inventory |
| 6 | [[WORKFLOWS]] | Step-by-step business processes |
| 7 | [[ROUTES]] | Every app route |
| 8 | [[DATABASE]] | Tables, relationships, constraints |
| 9 | [[ARCHITECTURE]] | Layers, services, data flows |
| 10 | [[DECISIONS]] | Architecture decision records |
| 11 | [[BUGS]] | Open / resolved / limitations |
| 12 | [[CHANGELOG]] | Append-only task history |
| 13 | [[README]] | Obsidian vault index + doc rules |

### Domain hubs (graph nodes)

| People & identity | Inventory | Money | Move-out | Operations |
|-------------------|-----------|-------|----------|------------|
| [[Residents]] | [[Rooms]] | [[Billing]] | [[Vacating]] | [[Operations]] |
| [[KYC]] | [[Beds]] | [[Deposits]] | [[Checkout Settlements]] | [[Action Center]] |
| [[Bookings]] | [[Bed Assignment]] | [[Electricity]] | | [[Notifications]] |
| | | [[Invoices]] | | [[Payment Links]] |

### Legacy deep reference

- [[AWESOME_PG_MASTER_DOCUMENTATION_V2]] — post-v1 product + technical spec
- [[AWESOME_PG_MASTER_DOCUMENTATION]] — Phase 1 baseline

---

## 7. Instructions for future AI agents

### Before writing code

1. Read **this file** → [[CURRENT_STATE]] → the relevant **domain hub** (e.g. [[Vacating]] for move-out bugs).
2. Open [[ROUTES]] to find canonical URLs — avoid legacy redirects.
3. Open [[DECISIONS]] before changing business logic — do not contradict ADRs without a new ADR entry.
4. Identify the **SSOT service** in [[ARCHITECTURE#Service map (SSOT)]] — extend it, do not duplicate logic in components.

### While implementing

- Match existing code style and patterns in surrounding files.
- Use half-open date math consistently (`billing.ts`, `bedReservations.ts`).
- Serialize dates/maps before client boundaries.
- Run relevant tests: `npm test` (see `tests/unit/` for billing, vacating, occupancy).

### After completing a task

1. **Classify into MEMORY/** — [[tasks]], [[decisions]], [[insights]], or [[mistakes]] as appropriate; update [[active_memory]] if focus shifted.
2. Append [[CHANGELOG]] with date, commits, and areas touched.
3. Update [[CURRENT_STATE]] if priorities or status changed.
4. Move bug entries in [[BUGS]] (open → resolved).
5. Add [[DECISIONS]] entry for architectural choices (+ one line in [[decisions]]).
6. Update domain hub + [[features]] / [[ROUTES]] / [[DATABASE]] if surface area changed.
7. Pre-commit hook runs `scripts/sync-docs-pre-commit.ts` automatically on staged code.

### Memory classification (required)

**Any new information must be classified before being written.**

| Type | File |
|------|------|
| Actionable | [[tasks]] |
| Idea | [[ideas]] |
| Decision | [[decisions]] (+ [[DECISIONS]] if ADR) |
| Insight | [[insights]] |
| Mistake | [[mistakes]] |
| Focus shift | [[active_memory]] |

Never dump unstructured notes into SYSTEM/ or PROJECT/ files.

### Where to act (admin)

| Task | Go to |
|------|-------|
| Daily priority queue | [[Operations]] `/admin/operations` |
| Approve move-out | [[Vacating]] `/admin/vacating` |
| Refund / settlement | [[Checkout Settlements]] `/admin/checkout-settlements/[id]` |
| Rent / UPI proof | [[Billing]] `/admin/revenue/billing` |
| Resident financial drill-down | [[Residents]] `/admin/residents/[customerId]` |
| Assign bed | [[Bed Assignment]] `/admin/pgs/[pgId]/map` |
| KYC approve | [[KYC]] `/admin/residents/kyc/[id]` |

### Quick paste for a new session

Copy [[HANDOVER]] into the chat, or say: *"Read `docs/START_HERE.md` and follow links for [your task]."*

---

## Related

[[README]] · [[AI_CONTEXT]] · [[HANDOVER]] · [[CURRENT_STATE]] · [[ARCHITECTURE]] · [[features]] · [[WORKFLOWS]]

*Last updated: 2026-06-21*
