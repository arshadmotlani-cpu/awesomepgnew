# Active Memory

> **Live system state** — updated when focus, priorities, or constraints change.  
> Formal snapshot: [[CURRENT_STATE]] · Classified log: [[tasks]] · [[ideas]]

---

## Current Focus

- **Stability Phase (Awesome PG, from 2026-08-01)** — All PG work: map dependents → baseline tests → change → `npm run stability:report` → regression test on bug fixes → production read-only audit for billing → commit only when green. → `docs/STABILITY_PHASE.md`

- **For Your Hair ERP (Quick Sale stabilized)** — Hold bill, attribution splits in `share_bps`, docs `docs/foryourhair/QUICK_SALE.md`. **Next phase only:** inventory consumption, package redemption, membership consumption on Quick Sale pay. Migrate through **`0014`** (`npm run hair:db:migrate`).

- **Automotive Capital audit remediation (shipped locally)** — Money integrity (activity reverse↔cost/seller ledgers), settle without capital-return gate, Reports = Dashboard Active Capital / entitled My Profit, Purchase Pending = seller Remaining SSOT, vehicle IA collapsed to Overview|Work|Sale|Files.

- **Automotive Capital dealership OS (ADR-020 + dealer surface)** — UI answers buy / cost / paid seller / remaining / profit only. No Funding Status, Gap, My/Partner Investment, Over/Underfunded. Stakes remain internal for Active Capital + ROI (auto Me = purchase).

- **Automotive Capital Profit Distribution Mode** — Sale-time SELF vs PARTNERSHIP_50_50 (ADR-018). **Frozen** — see PROFIT_DISTRIBUTION_SSOT.md. Migrations `0010`+`0011`. Mode chosen at Record Sale (default SELF); edit on Sale tab.

- **Automotive Capital Purchase Payment UX** — Token + seller payments = progress against Purchase Price (Overview). Activities = external costs only. TVI = Price + costs − refunds (ADR-016 unchanged). Payment form: amount + instrument + date + notes only.

- **Automotive Capital product IA (final)** — Sidebar = Dashboard / Vehicles / Reports / Settings only. Operating Console Dashboard: Position → Pace(3) → Insights → Recent Sales (Attention Required removed). Payments/Ledger/Documents live on vehicle workspace.

- **Automotive Capital Additional Income** — Separate ledger on vehicle Overview (`0015`); Gross Profit = Sale − TVI + Additional Income; does not change TVI / Active Capital. Broker **cost** vs Brokerage **income** are distinct.

- **Automotive Capital partnership profit model** — Sufii operating-partner cut (Settings, default 50%) + Investor Pool by stake; funding always = Net Vehicle Cost; sale auto-calcs only. Migration `0008_deal_economics`.

- **Automotive Capital multi-investor model** — Each vehicle has Layer 1 (business: purchase/sale/expenses) + Layer 2 (`ac_asset_investors`: Me / Investor 2 / Investor 3). My ROI uses my stake only. Migration `0006` applied on invest Neon.

- **Automotive Capital My vs Business dashboard** — Toggle switches full KPI + chart datasets (My share vs Business gross). Removed Working Capital / Free Cash / Lifetime Purchase Volume / Initial Capital from Overview.

- **Automotive Capital new-asset form** — Shipped (`cd61a3c`); production `/assets/new` verified. Migration `0004` applied on invest Neon.

- **Automotive Capital Investment OS Overview** — Shipped to production (`6a9ec49`); invest Overview + manual profits verified live (19/19 checks). Neon migration already applied.

- **Automotive Capital host routing** — Root cause: Capital code was never on `main`; production git deploys served Awesome PG on invest. Fix: commit Capital + harden host/`x-forwarded-host` allowlist middleware.

- **Automotive Capital production deploy** — App live on invest host; DNS resolved via Vercel. Admin credentials synced for both apps.

- **Operations Center P0 redesign** — Phase 1 audit complete (`docs/OPERATIONS_CENTER_AUDIT.md`); awaiting approval before implementation. Goal: true action center only, invoice/payment SSOT, no duplicate queues.
- **Monorepo final stabilization (W0–W4)** — CI Hair E2E optional job; env contract; Hair UAT M6/M15 + ops minimum (schedules, chairs, reports); PG verification runbook; occupancy phase0 documented + parity tests; Capital docs/sign-off checklist. Remaining: PG prod audit execution, occupancy loader consolidation, loyalty plan CRUD (M7), inventory adjustments (M8), W4 P1 polish.

- **Occupancy SSOT** — Engine + resolver wired on admin map and room detail; remaining Tier B loaders per `OCCUPANCY_PHASE0_STATUS.md` (was: blocked on approval only)
- **Resident Portal V2** — 5-tab resident hub shipped (Profile/Payments/Requests/Referrals/ Concierge); legacy tab URLs redirect to V2
- **Semantic Intelligence Layer** — `brain-semantic.sh` → intent + impact + `Semantic State`
- Git-backed vault synced to https://github.com/arshadmotlani-cpu/awesomepg-docs
- Stabilize vacating / checkout ops post-`d4c01c6` deploy
- Consolidate admin actions into [[Operations]] + module hubs

---

## Current Blockers

- **Automotive Capital Overview** — Deployed and verified on invest production

- **Occupancy SSOT** — 6 independent compute paths; Phase 0 (`bedOccupancyEngine.ts` + parity tests) awaiting architecture approval
- None for vault sync (GitHub push working via SSH)
- Post-deploy verification of vacating/ops fixes still pending ([[tasks]])

---

## Latest Decisions

See [[decisions]] · Recent: Property Performance / Overview money = `getRevenueCommandCenterData` only (2026-07-29); MEMORY engine + `docs/.cursor/rules.md` + `brain-sync.sh` (2026-06-22)

---

## Top 5 Priorities

1. **Approve Occupancy SSOT plan** — implement `bedOccupancyEngine.ts` + admin/public/resident parity tests before any UI patches
2. Verify `/admin/vacating` and [[Operations]] move-out queue end-to-end in production
3. Approve pending move-outs (e.g. Mohd Aatif — notice filed, not approved)
4. Complete checkout settlements in progress (e.g. Harish)
5. Reduce duplicate vacating/deposit/refund CTAs across admin UI

---

## Active Tasks

See [[tasks]] for full task log. Current:

- [ ] Post-deploy verification of vacating/ops fixes
- [ ] Enable vault GitHub remote + optional fswatch auto-sync
- [ ] Admin UX consolidation (single action surfaces)

---

## Active Constraints

- **Append-only memory** — never overwrite history in MEMORY/
- **Lightweight system** — no destructive edits without approval
- **Markdown SSOT** — this vault is the knowledge source of truth
- **Classify first** — new info goes to MEMORY/ before SYSTEM/ or PROJECT/
- **Half-open stays** — `[check_in, check_out)` date math is non-negotiable
- **Money SSOT** — `residentFinancialEngine.ts`; no inline billing math in UI

---

## Related

[[START_HERE]] · [[CURRENT_STATE]] · [[tasks]] · [[decisions]] · [[AI_CONTEXT]]

*Last updated: 2026-06-22*

<!-- AGENT_STATUS_START -->
## Agent status

> **Last run:** 2026-07-28T18:16:39Z  
> **Primary type:** TASK  
> **All types:**  · REFACTOR ·  · TASK ·   
> **Files:** 4

<!-- AGENT_STATUS_END -->







<!-- INTELLIGENCE_DELTAS_START -->
### 2026-07-28T18:16:39Z — review recommended

- **Signal:** TASK change in project state files
- **Action:** Verify Current Focus / Blockers / Priorities still accurate
- **Trigger files:** MEMORY/active_memory.md,MEMORY/changelog.md,MEMORY/tasks.md,foryourhair/README.md

<!-- INTELLIGENCE_DELTAS_END -->





<!-- SEMANTIC_STATE_START -->
## Semantic State

> **Last analyzed:** 2026-08-01T10:14:46Z

- **Current system intent:** The AI memory / intelligence automation layer is being extended — cognition pipeline or MEMORY structure changed.
- **Dominant change type:** MIXED (see changelog)
- **System momentum:** LOW (0 vault commits in 24h)
- **Risk level:** LOW

<!-- SEMANTIC_STATE_END -->

















