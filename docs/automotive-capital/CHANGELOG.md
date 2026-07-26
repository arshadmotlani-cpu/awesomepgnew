# Changelog — Automotive Capital

All notable changes to Automotive Capital planning and implementation.

Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

### Changed — Purchase Payment vs Activities UX
- Create form shows live Remaining Purchase Payment (Price − Token); redirect → Overview Purchase Payment
- Activities form: external costs only — Token / Purchase Payment removed (`selectable: false` + server guard)
- Dedicated Record Purchase Payment on Overview (caps at remaining; does not change TVI)
- Refund copy clarifies cash returns are never profit; negative cost activities reduce TVI
- TVI formula unchanged (ADR-016)

### Changed — Profit Distribution is sale-time (ADR-018 amendment)
- Removed Profit Distribution from New Vehicle create form
- Record Sale requires mode (default: Entire profit is mine / SELF); preview uses selection
- After sale, edit mode on Sale tab; Profit tab is read-only stats
- `profit_distribution_mode` nullable until sold (`0011_sale_time_profit_distribution`)
- `recordSale(…, profitDistributionMode)` writes mode + shares via SSOT

### Added — Profit Distribution SSOT freeze
- `computeGrossDealProfit` centralized; no inline sale−TVI on vehicle paths
- Regression scenarios A/B (₹5L→₹6L SELF / PARTNERSHIP) + mode-flip + dashboard sum tests
- Mode edit revalidates dashboard, reports, assets, analytics redirect, `capital-dashboard` tag
- Canonical doc: [`PROFIT_DISTRIBUTION_SSOT.md`](./PROFIT_DISTRIBUTION_SSOT.md) — architecture frozen

### Added — Profit Distribution Mode (ADR-018)
- Per-deal `SELF` | `PARTNERSHIP_50_50` chosen at sale; migration `0010` + sale-time `0011`
- Gross Deal Profit → My/Sufii by mode only; Settings Sufii % no longer applies to vehicle sales
- Editable on Sale tab with audit; `recalculateAsset` redistributes on every sold vehicle
- Run `npx tsx scripts/capital-recalc-deal-profits.ts` after migrate if shares need healing

### Changed — Operating Console Dashboard
- Hierarchy: Current Position → Attention Required → Dealership Pace (3 charts) → Business Insights → Recent Sales
- Removed chart wall / Monthly Growth combo / Cash Flow / audit Recent Activity from Dashboard
- Attention queues: repairs, ready to list, purchase pending, advances, pending documents
- Pace: Monthly Profit bars, Purchase vs Sale value, Capital Distribution donut (Purchased/Repair/Ready/Listed/Sold)

### Changed — Product IA: 4-item nav + single Dashboard
- Sidebar only: Dashboard, Vehicles, Reports, Settings
- Analytics removed; deep insights merged into Dashboard
- Standalone Payments/Capital/Ledger/Documents/Activity/Search redirect into Vehicles or Dashboard
- Vehicles: lifecycle tabs + inventory cards; Payments tab on vehicle workspace

### Changed — Dashboard vs Analytics IA
- *(superseded)* Analytics page removed; content lives on Dashboard

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
