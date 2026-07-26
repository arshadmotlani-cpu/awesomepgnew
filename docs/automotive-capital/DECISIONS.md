# Decisions — Automotive Capital

Architecture Decision Records (ADRs). Append-only.

---

## ADR-001: Host-Based Routing in Same Next.js App

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Automotive Capital shares the Awesome PG monorepo and Vercel deployment. It needs complete product independence while minimizing infrastructure duplication.

### Decision
Use host-based routing in the existing Next.js app:
- `invest.awesomepg.in` → Capital routes (`app/(capital)/`)
- `www.awesomepg.in` → PG routes (unchanged)

Middleware performs host detection as the first decision. PG middleware logic remains untouched below the host guard.

### Alternatives Considered
1. **Separate repository** — Cleanest isolation but duplicates CI/CD, env management, and deployment overhead.
2. **Separate Vercel project in monorepo** — Good isolation but requires monorepo conversion (not currently structured).
3. **Path prefix (`/invest/`)** — Simpler but URLs would be `awesomepg.in/invest/` which breaks product independence requirement.

### Consequences
- Single build, single deploy
- Must enforce strict module boundaries via ESLint
- Middleware complexity increases slightly
- Risk of PG regression if host guard has bugs (mitigated by tests)

---

## ADR-002: Separate Neon Database

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Financial data for Capital must be isolated from PG operational data. Future scale target is ₹10 crore+.

### Decision
Dedicated Neon PostgreSQL database connected via `INVEST_DATABASE_URL`. Independent Drizzle schema, migrations, and client in `src/capital/db/`.

### Alternatives Considered
1. **Shared database with `ac_` table prefix** — Simpler ops but couples backup/restore, migration timing, and creates risk of cross-query bugs.
2. **SQLite for dev** — Incompatible with Vercel serverless production.

### Consequences
- Two databases to manage in Vercel env
- Build script runs both migration sets
- Complete financial isolation
- Independent Neon branching for preview deploys

---

## ADR-003: Asset-First Domain Model

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Cars are the first investment type but the system must support property, gold, machinery, business investments, and loans without schema redesign.

### Decision
Polymorphic `ac_assets` table with `asset_class` enum. Type-specific detail tables (starting with `ac_automotive_details`). All financial tables reference `asset_id`.

### Alternatives Considered
1. **Car-centric schema** — Simpler for Phase 1 but requires painful migration when adding asset types.
2. **EAV (entity-attribute-value)** — Flexible but terrible query performance and type safety.

### Consequences
- Slightly more complex Phase 1 schema
- New asset classes add a detail table + enum value, not financial table changes
- Services use strategy pattern per asset class

---

## ADR-004: Append-Only Ledger with Reversals

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Financial software managing real money requires audit-grade history. The user explicitly stated "the ledger is sacred."

### Decision
`ac_ledger_entries` is append-only. No UPDATE or DELETE on financial amounts. Corrections create reversal entries with `reversal_of_entry_id`. Source rows marked `is_reversed = true`.

### Alternatives Considered
1. **Soft delete with audit** — Simpler but ledger can be silently corrupted.
2. **Event sourcing** — Most rigorous but over-engineered for single-user Phase 1.

### Consequences
- Ledger grows monotonically (plan partitioning at 1M+ rows)
- UI must clearly show reversed entries
- Integrity check script can verify balance

---

## ADR-005: Money as Paise (bigint)

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Indian Rupee amounts with decimal precision. Floating-point arithmetic is unacceptable for financial software.

### Decision
Store all amounts as `bigint` paise (1/100 rupee). Display formatting converts to rupees with Indian numbering (lakhs, crores).

### Alternatives Considered
1. **Decimal/numeric SQL type** — Correct but Drizzle bigint is simpler and matches PG codebase patterns.
2. **Store as rupees with 2 decimal places in integer** — Same as paise but less conventional naming.

### Consequences
- All UI inputs accept rupees, convert to paise on submit
- All display components format paise to rupees
- Consistent with existing Awesome PG `amount_paise` pattern

---

## ADR-006: Custom DB Sessions (Not NextAuth)

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Single admin user. Need session revocation, audit, and DB-backed validation. Awesome PG already has a proven `auth_sessions` pattern.

### Decision
Adapt PG's DB-backed session pattern for Capital:
- `ac_auth_sessions` table with hashed tokens
- `ac_session` httpOnly cookie
- scrypt password hashing
- No NextAuth dependency

### Alternatives Considered
1. **NextAuth/Auth.js** — Heavier dependency for single-user credentials-only auth.
2. **JWT-only sessions** — Cannot revoke without blocklist; no session audit.

### Consequences
- Proven pattern from PG codebase (copy crypto, adapt session)
- Full control over session lifecycle
- One less dependency

---

## ADR-007: Vercel Blob for Document Storage

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Need secure document upload for invoices, bills, RC, photos. Awesome PG already uses Vercel Blob with a proven wrapper.

### Decision
Use Vercel Blob with adapted `src/capital/lib/storage/blob.ts`. Private blobs served via authenticated proxy route. Path prefix: `capital/documents/`.

### Alternatives Considered
1. **UploadThing** — User's original spec mentioned it, but PG already has Blob infrastructure and adding another upload provider increases complexity.
2. **S3 direct** — More configuration, no benefit over Blob on Vercel.

### Consequences
- Reuse blob wrapper pattern from PG
- Optional separate `INVEST_BLOB_READ_WRITE_TOKEN` for isolation
- No UploadThing dependency

---

## ADR-008: shadcn/ui Component Library

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Premium UI requires polished, accessible components. PG uses hand-rolled Tailwind with no component library. Capital needs a fresh design system.

### Decision
Install shadcn/ui under `src/capital/components/ui/` with Capital-specific tokens. Do not share UI components with PG.

### Alternatives Considered
1. **Reuse PG admin components** — Violates branding independence requirement.
2. **Headless UI only** — More work for same result.
3. **Material UI** — Wrong aesthetic for premium dark glassmorphism.

### Consequences
- New dependencies (Radix, CVA, etc.)
- Components owned in repo (not npm package)
- Full styling control with Capital tokens

---

## ADR-009: Code Location `src/capital/`

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Need clear namespace for all Capital code within the PG monorepo.

### Decision
All Capital domain code under `src/capital/`. Routes under `app/(capital)/`. Drizzle config at `capital/drizzle.config.ts`. Docs at `docs/automotive-capital/`.

### Alternatives Considered
1. **`src/invest/`** — Less descriptive of the product name.
2. **Top-level `apps/capital/`** — Requires monorepo restructuring.

### Consequences
- Clear grep boundary: `src/capital/` vs `src/services/`
- ESLint rules can enforce import restrictions
- Easy to extract to separate repo later if needed

---

## ADR-010: No Demo Data by Default

**Date:** 2026-07-10  
**Status:** Accepted

### Context
Production financial software should not ship with fake data. User requested no demo data unless optional.

### Decision
Seed script creates only: settings singleton, expense categories, admin user. No assets, expenses, or payments unless `CAPITAL_SEED_DEMO=true` env var is set.

### Alternatives Considered
1. **Rich demo dataset** — Useful for development but risky if accidentally deployed to production.

### Consequences
- Empty states are critical UX (designed in UI_SYSTEM.md)
- Developers can opt into demo data locally
- Production starts clean

---

## ADR-011: Partnership Profit Model (Operating Partner + Investor Pool)

**Date:** 2026-07-11  
**Status:** Superseded for vehicle sales by ADR-018 (2026-07-26)

### Context
Automotive Capital is an investment partnership, not a traditional dealership. Sufii is the operating partner and does not invest capital by default. Capital investors (Me / Investor 2 / Investor 3) fund Net Vehicle Cost. Profit must never be entered manually on vehicle sale.

### Decision
1. **Net Vehicle Cost** = Purchase + Repairs − Dealer Refunds/Credits (signed expenses). `total_investment_paise` stores this value.
2. **Funding** = Σ capital investor stakes must always equal Net Vehicle Cost (`funding_gap_paise === 0` before sale).
3. **Business Profit** = Sale − Net Vehicle Cost.
4. **Operating partner (Sufii)** receives Settings ratio of Business Profit (default `1/2` = 50%).
5. **Investor Pool** = remainder; split proportional to invested stakes among Me / Investor 2 / Investor 3.
6. Sale UI accepts only Sale Price + Sale Date. SSOT: `src/capital/lib/dealEconomics.ts`. Migration: `0008_deal_economics.sql`.

### Alternatives Considered
1. **100% profit to capital by stake** — Incorrect for operating partnership.
2. **Hardcoded 50/50 Sufii cut** — Too rigid; agreement may change (Settings kept).

### Consequences
- `partner_share_paise` means Sufii / operating partner, not co-investor residual.
- Expenses may create a funding gap; Update Investments form rebalances before sale.
- Payment-type `refund` remains cash-recovery and does not change Net Vehicle Cost.
- **Superseded:** Vehicle deals now use per-vehicle Profit Distribution Mode (ADR-018). Settings ratio remains for **manual profits** only.

---

## ADR-012: Vehicle Activities Timeline + Cost from Activities

**Date:** 2026-07-25  
**Status:** Accepted (cost formula superseded by ADR-016)

### Context
Expense-centric UX and auto-debiting full purchase on create did not match how deals actually unfold (token → payments → repairs with advances). Funding should track purchase price (Me + Partner), while Net Vehicle Cost should accumulate from real cost events.

### Decision
- Introduce `ac_vehicle_activities` as the vehicle timeline SSOT and primary cost driver.
- Stop posting full `asset_purchase` ledger debit on create; insert `vehicle_created` only.
- Funding target = purchase price (Me + Partner); deprecate new `investor_3` writes.
- Repair advances are cash-only until settlement; settlement actual cost hits vehicle cost.
- Remove Expenses from Capital nav; activities are vehicle-scoped.

### Consequences
- Migration `0009_vehicle_activities` backfills activities from purchase price + non-purchase expenses.
- Legacy `ac_expenses` retained for history; new cost entry via Add Activity.
- **Note:** ADR-012’s “activities-only, no purchase base” cost sum is replaced by ADR-016 (Purchase Price + investment-cost activities; milestones excluded).

---

## ADR-013: Vehicles Terminology + Partner Toggle UX

**Date:** 2026-07-26  
**Status:** Accepted

### Context
Dealership operators think in vehicles and inventory, not accounting “assets”. Most purchases are fully self-funded; always showing partner fields adds noise. Autosaved drafts were restoring prior vehicle data into New Vehicle.

### Decision
- User-facing module label is **Vehicles** (routes remain `/assets`).
- **Purchased with Partner** toggle defaults OFF; My Investment = purchase price when off.
- New Vehicle uses draft key `vehicle-new-v2` and Clear form / post-create draft delete so forms start blank.
- Profile workspace tabs: Overview, Timeline, Activities, Investment, Photos, Documents, Profit, Sale (+ Accounting).

### Consequences
- Cover photo shown on inventory list and profile hero via `cover_document_id`.
- Legacy expense services remain for history; UI path is vehicle Activities only.

---

## ADR-014: Single Personal Dealership Dashboard

**Date:** 2026-07-26  
**Status:** Accepted

### Context
The Capital overview mixed Business vs My perspectives, duplicated capital metrics, and used oversized investment-style charts that did not help daily vehicle operations.

### Decision
- One dashboard only — always personal (`views.mine`); remove Business View UI.
- Six compact KPIs: Active Vehicles, Vehicles Sold, Lifetime Profit, Monthly/Period Profit, Avg Profit Per Vehicle, ROI.
- Quick actions: Add Vehicle + Add Manual Profit only.
- **Personal ROI retained:** `My Lifetime Profit ÷ My Capital Stakes` (via `computePersonalRoiBps` / overview wiring). Not changed this pass.
- **Candlesticks rejected** for portfolio growth: data is a single monthly profit series, not OHLC. Use **monthly bars + cumulative line** (`ProfitGrowthCombo`) instead.
- Remove Capital At Risk duplicates, allocation donut, investment waterfall, monthly ROI chart, and activity timeline from the dashboard.

### Consequences
- Cleaner above-the-fold inventory + profit focus.
- `views.business` remains in the overview service payload unused (prune later if desired).

---

## ADR-015: Executive Dealership Dashboard Restore

**Date:** 2026-07-26  
**Status:** Accepted

### Context
ADR-014’s minimal pass removed useful signals (Active Capital, ops health, activity, purchase/sale volume). The owner dashboard needs density and grouping — not a stripped KPI strip.

### Decision
- Keep **single personal view** only (`views.mine`). No Business View return.
- Replace flat KPI tiles with **four grouped cards:** Inventory (In Stock / Sold / Total), **Active Capital** (one amount — my stakes on in-stock vehicles), Profit (lifetime + period), Performance (ROI + avg profit/vehicle).
- **Active Capital once** — same figure as `capitalAtRiskPaise` / `activeCapitalPaise`; never a second “At Risk” card.
- **Business Health** only when counts > 0: Under Repair (`repairing`+`painting`), Ready, Listed, Just Purchased, Open Repair Advances. Omit RC / transport / docs / pending payments until workflow SSOTs exist.
- **Recent Activity** from `ac_activity_log` with human labels; asset entities link to `/assets/{id}`.
- Charts: keep **Profit Growth** combo (monthly bars + cumulative line); add **Purchases vs Sales** dual bars. Candlesticks remain rejected.
- **Personal ROI unchanged:** `My Lifetime Profit ÷ My Capital Stakes`.

### Consequences
- Overview bundle gains `vehicleStatusCounts`, `openRepairAdvancesCount`, `monthlySales`, and `activeCapitalPaise` alias.
- Dense executive above-the-fold without duplicate capital widgets.

---

## ADR-016: Frozen Total Vehicle Investment (Option 2)

**Date:** 2026-07-26  
**Status:** Accepted — **Financial SSOT**

### Context
Treating Token / Purchase Payment as vehicle cost double-counted acquisition when Purchase Price was also the negotiated base. Dealers need a frozen formula for investment, profit, ROI, analytics, and reports.

### Decision
**Total Vehicle Investment** =

```
Purchase Price
+ Broker Commission
+ Transportation
+ Repair Costs (settlement actual)
+ Insurance + Fuel + Accessories + RTO + Storage + Washing/Service + Miscellaneous
− acquisition-related refunds / returns
```

**Payment milestones** (Token Paid, Purchase Payment, Final Purchase Payment) track progress toward Purchase Price only — `costImpact: cash_only`. They **never** enter TVI.

**Repair Advance** is cash float until settlement; only settlement **actual cost** is investment.

**Profit** = Sale Price − Total Vehicle Investment.

**ROI architecture unchanged** (Business ÷ TVI / Personal ÷ my stake). Future formula changes require a new ADR.

SSOT: `src/capital/lib/activityTypes.ts` (`computeTotalVehicleInvestment`), wired via `recalculateAsset`.

### Alternatives Considered
1. Activities-only sum (ADR-012) — understated when milestones were reclassified and no purchase base.
2. Purchase Price + all activities including milestones — double-counts acquisition.

### Consequences
- Create vehicle starts TVI at purchase price; Token is create-time payment progress only.
- Post-create lands on Overview → Purchase Payment (not Activities).
- Activities never offer Token / Purchase Payment (`selectable: false` + server guard).
- Historical assets: re-run `scripts/recalc-capital-assets.ts` after deploy so stored `total_investment_paise` matches ADR-016.
- Contributors must not change this formula without a documented ADR.

---

## ADR-017: Vehicle Lifecycle SSOT (State vs Activities)

**Date:** 2026-07-26  
**Status:** Accepted

### Context
The product became activity-driven: timelines and dashboards explained events but not “where is this vehicle right now?” Asset status already existed (`ac_asset_status`) but was mostly manual and buried in Sale.

### Decision
- **State and activities are independent.** Every vehicle has exactly one current lifecycle status. Activities are historical events and never *are* the current state.
- **Reuse existing enum** — no new DB values this pass. Dealer labels:
  - `purchased` → Just Purchased
  - `repairing` / `painting` → Under Repair (Painting keeps enum)
  - `ready` → Ready For Sale
  - `listed` → Listed For Sale
  - `sold` → Sold
  - `settled` → Settled (finance close)
  - `cancelled` → Archived
- **Purchase Pending** is a **derived badge** (purchased + milestones unpaid / funding gap), not an enum. **Delivered** deferred to Phase 2.
- Enforce `allowedTransitions` in `updateAssetStatus`. Auto: first `repair_advance` → `repairing` only from `purchased`|`painting`. Suggest Ready after repair settlement (dealer confirms). Sale/settle keep dedicated workflows.
- Timeline interleaves state-change events with purchase activities.
- Dashboard groups vehicles by lifecycle state first.

SSOT: `src/capital/lib/vehicleLifecycle.ts`

### Consequences
- Overview shows Lifecycle control; list/detail use friendly labels.
- Invalid status jumps are rejected.
- Future enums (`purchase_pending`, `delivered`) require a new ADR.

---

## ADR-018: Profit Distribution Mode (SELF vs PARTNERSHIP_50_50)

**Date:** 2026-07-26  
**Status:** Accepted (supersedes ADR-011 for vehicle sales)  
**Amended:** 2026-07-26 — sale-time workflow (not purchase)

### Context
Not every vehicle is a Sufii partnership. Self deals must give 100% of Gross Deal Profit to Me; Sufii’s earnings on those deals are expenses (broker, transport, repair), not profit share. Applying Settings 50% to every sale produced incorrect My Profit / ROI / dashboard totals. The split is usually unknown at purchase and is decided when the deal closes.

### Decision
1. `ac_assets.profit_distribution_mode`: `SELF` | `PARTNERSHIP_50_50` | `NULL` (unsold).
2. **Sale-time property** — not asked at vehicle create. Column stays `NULL` until `recordSale`.
3. Record Sale requires mode; UI default is **SELF** (most deals are self-funded).
4. Gross Deal Profit = Sale − TVI (unchanged).
5. **SELF** → My Profit = Gross; Sufii Profit = 0.
6. **PARTNERSHIP_50_50** → My Profit = `round(Gross/2)`; Sufii = Gross − My.
7. Capital investors remain funding / My ROI base only; `investor_2` gets 0 deal profit.
8. Editable on vehicle **Sale** tab after sale (`profit_distribution_mode_changed`); recalculates via `recalculateAsset`. Profit tab is read-only stats.
9. One SSOT: `distributeDealProfits` in `dealEconomics.ts`. Settings Sufii % applies to **manual profits** only.

Migrations: `0010_profit_distribution_mode.sql`, `0011_sale_time_profit_distribution.sql`. Recalc: `scripts/capital-recalc-deal-profits.ts`.

### Consequences
- Dashboard / Reports / Analytics continue to read stored `my_share_paise` — correct after recalc.
- No page-specific profit formulas.
- **FROZEN:** Vehicle profit math lives only in `dealEconomics.ts`. Future features must consume stored engine outputs. See [`PROFIT_DISTRIBUTION_SSOT.md`](./PROFIT_DISTRIBUTION_SSOT.md).

---

## ADR-019: Three Ledgers — Vehicle Cost, Seller Payments, Funding Sources

**Date:** 2026-07-26  
**Status:** **Superseded** by ADR-020 (Funding Sources half rejected)  
**Partial keep:** Vehicle Cost + Seller Payments tables remain.

### Context
Originally proposed three product ledgers including a Funding Sources ledger answering “where did cash come from?”

### Decision (original)
Three physical ledgers: Vehicle Cost, Seller Payments, Funding Sources (`ac_funding_entries`).

### Supersession
Dealership operating model does **not** track internal money arrangement. ADR-020 removes Funding Sources while keeping seller payments (with instrument) and vehicle costs. Active Capital returns to ADR-015 (Me open stakes).

---

## ADR-020: Dealership OS — No Funding Sources

**Date:** 2026-07-26  
**Status:** Accepted — **Product philosophy SSOT**  
**Supersedes:** ADR-019 Funding Sources ledger / Funding History / source pickers  
**Restores:** ADR-015 Active Capital = Me stakes on open vehicles

### Context
Funding Sources was technically valid accounting but mismatched how the dealership operates. The owner does not want to manage sources of money, funding history, or “where did this payment come from?” workflows.

### Decision

**Keep (vehicle economics only):**
- Purchase Price, Token, Purchase Payments
- Payment **instrument** (Cash, RTGS, NEFT, Cheque, UPI, Bank) + date + notes
- Vehicle Costs → TVI (ADR-016)
- Auto: Purchase Remaining, Gross/My Profit, ROI, Dashboard, Reports
- Me / Partner **deal stakes** (`ac_asset_investors`) for ROI / funding gap — ownership, not cash-source accounting

**Remove:**
- Funding Source selection, Funding History, Funding Ledger (`ac_funding_entries`)
- Funding navigation / forms / linking / dialogs
- Any workflow requiring explanation of how money was arranged

**Tables:** Keep `ac_seller_payments` + `ac_vehicle_costs`. Drop `ac_funding_entries` (migration `0013_drop_funding_sources.sql`).

**Active Capital:** Σ Me stakes on in-stock vehicles (not funding deploys).

### Consequences
- Payment form = amount + instrument + date + notes only
- `/capital` redirects to Dashboard; Capital removed from sidebar/hotkeys
- Contributors must not reintroduce funding-source UX without a new ADR

---

## Template for Future ADRs

```
## ADR-NNN: Title

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded

### Context
Why this decision is needed.

### Decision
What we decided.

### Alternatives Considered
What else we evaluated.

### Consequences
Positive and negative outcomes.
```
