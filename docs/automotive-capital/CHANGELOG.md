# Changelog — Automotive Capital

All notable changes to Automotive Capital planning and implementation.

Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

### Changed — New Vehicle UX (token-first + clean money inputs)
- Hide native number spinners on all Capital amount fields
- My Investment stays empty until Purchase Price is entered
- Optional Token Paid on create (milestone only; supports token-only → Purchase Pending)
- Dashboard duplicate “Add Vehicle” removed; header New Vehicle is the single entry point

### Added — Vehicle Lifecycle SSOT (ADR-017)
- State vs activities separation; reuse `ac_asset_status` with dealer labels
- Enforced transitions; auto Under Repair on repair advance; Overview lifecycle control
- Timeline interleaves state changes with purchase activities; dashboard groups by state

### Changed — Frozen Total Vehicle Investment (ADR-016)
- TVI = Purchase Price + investment-cost activities − refunds (Token/Purchase Payment = milestones only)
- Create UX: no live funding calculator; collapsible Partner Investment; post-create → Purchase Activities
- Repair settlement shows Additional Amount Required when actual > advance
- Edit vehicle + edit/reverse purchase activities; Overview TVI breakdown + payment progress
- Types added: `final_purchase_payment`, `rto`, `storage`

### Changed — Executive dealership dashboard restore
- Grouped overview cards: Inventory, Active Capital (once), Profit, Performance
- Conditional Business Health chips (status counts + open repair advances only)
- Recent Activity feed restored; Purchases vs Sales chart added beside Profit Growth
- Personal ROI unchanged: My Lifetime Profit ÷ My Capital Stakes (ADR-015)

### Changed — Dealership owner dashboard
- Single personal dashboard (Business View removed from UI)
- Compact six-KPI grid; Capital At Risk / allocation / waterfall / activity timeline removed from overview
- Profit Growth combo chart (monthly bars + cumulative line); candlesticks rejected as unsuitable for single-series profit data
- Quick actions: Add Vehicle + Add Manual Profit only
- Personal ROI formula documented and retained (ADR-014)

### Added — Vehicle Investment OS
- Vehicle-scoped **activities timeline** (`ac_vehicle_activities`) as SSOT for cost events
- **Repair advances** (`ac_repair_advances`): cash float until settlement; only actual cost hits Net Vehicle Cost
- Asset create no longer posts full purchase ledger debit; cost builds via Token / Purchase Payment / other cost activities
- Funding = **Me + Partner = Purchase Price** (Investor 3 deprecated for new writes)
- Expenses removed from nav (redirect `/expenses` → `/assets`); activities live on vehicle profile
- Assets inventory tabs: In Stock / Sold / All / Archived; registration-first list
- Cover photo + gallery on vehicle profile
- **UX completion:** Vehicles naming; Purchased with Partner toggle; blank New Vehicle (draft fix); cover on list + hero; profile tabs Overview/Timeline/Activities/Investment/Photos/Documents/Profit/Sale

### Planning
- Created complete planning documentation suite (13 documents)
- Defined asset-first domain architecture
- Designed independent Neon database schema with 14 tables
- Specified host-based routing for `invest.awesomepg.in`
- Documented security model for single-admin private application
- Designed premium dark glassmorphism UI system
- Defined 16 feature areas with acceptance criteria
- Documented 18 business workflows including end-to-end example
- Created phased roadmap (6 weeks estimated)
- Recorded 10 architecture decisions
- Identified 12 risks with mitigations

---

## [0.1.0] — 2026-07-10

### Added — Full Implementation
- Complete Automotive Capital application at `invest.awesomepg.in`
- Host-based routing with PG isolation (middleware)
- Independent Drizzle schema (14 tables) + migrations
- Single-admin auth (DB sessions, rate limiting)
- Dashboard with KPIs, charts, smart insights
- Asset lifecycle (create, status, sale, settle)
- Expenses, payments, capital investments with ledger
- Append-only ledger with reversals
- Reports with CSV/Excel/PDF export
- Document upload + authenticated proxy
- Command palette (Cmd+K), PWA manifest + service worker
- Analytics page with Recharts
- Activity log, global search, settings
- Unit tests (`tests/capital/unit/`)
- Deployment checklist

### Changed
- Extended `middleware.ts` with Capital host guard
- Extended `vercel-build.sh` for Capital migrations
- Login at `/login` (rewrites to `/auth/login` on invest host)

## [0.0.0-planning] — 2026-07-10

### Added
- `docs/automotive-capital/README.md` — project index
- `docs/automotive-capital/ARCHITECTURE.md` — system design
- `docs/automotive-capital/DATABASE.md` — schema specification
- `docs/automotive-capital/ROUTES.md` — URL map and Server Actions
- `docs/automotive-capital/SECURITY.md` — security model
- `docs/automotive-capital/UI_SYSTEM.md` — design system
- `docs/automotive-capital/FEATURES.md` — feature specifications
- `docs/automotive-capital/WORKFLOWS.md` — business flows
- `docs/automotive-capital/TASKS.md` — implementation checklist
- `docs/automotive-capital/ROADMAP.md` — phased delivery plan
- `docs/automotive-capital/DECISIONS.md` — architecture decisions
- `docs/automotive-capital/RISKS.md` — risk register
- `docs/automotive-capital/CHANGELOG.md` — this file

### Decisions
- Application named **Automotive Capital** (not Automotive Investment OS)
- Host routing in same Next.js app (not separate repo)
- Separate Neon database via `INVEST_DATABASE_URL`
- Asset-first polymorphic schema (cars = first asset class)
- Custom DB sessions (not NextAuth) — adapted from PG patterns
- Vercel Blob for documents (not UploadThing)
- shadcn/ui for component library
- Money in paise (bigint) throughout

---

## Version Scheme

| Version | Meaning |
|---------|---------|
| `0.0.x-planning` | Documentation only |
| `0.1.x` | Phase 1 — Foundation |
| `0.2.x` | Phase 2 — Core domain |
| `0.3.x` | Phase 3 — Reports & analytics |
| `0.4.x` | Phase 4 — Polish & PWA |
| `1.0.0` | Production launch |
