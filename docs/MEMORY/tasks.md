# Memory — Tasks

> **Append-only** actionable items. Move completed items to a `## Done` section — do not delete.

**Rule:** Tasks are actionable. Strategic items belong in [[ideas]].

---

## 2026-07-29

- [x] **FYH-SALES-SSOT** — Attributions 0013, staff performance reports, Reports nav tree, Quick Sale staff/discount UX
- [x] **PLAT-STABILIZATION-W0** — Hair E2E workflow, `ENV_CONTRACT.md`, `env:check --product=`
- [x] **FYH-STABILIZATION-W1** — Reports salon TZ, mobile billing/customers, `syncStaff` preserve + test
- [x] **FYH-STABILIZATION-W2** — Staff schedules UI, resources CRUD (settings), reports GST/top services/staff, billing honesty copy
- [x] **PG-STABILIZATION-W1-W2** — P0 verification runbook, occupancy phase0 status + parity tests
- [x] **CAP-STABILIZATION-W3** — Production sign-off checklist, README/TASKS sync with CHANGELOG
- [ ] **STABILIZATION-W4-REMAINDER** — Loyalty plan CRUD (M7), inventory adjustments (M8), PG prod audit execution, occupancy Tier-B consolidation, confirmation dialogs (PLAT-P1-2)

- [x] **FYH-APPOINTMENTS** — Appointment engine + DnD calendar (Day/Week/Timeline/Chair/Stylist), checkout billing, inventory consumption, commission, loyalty/bridal/reports/search
- [x] **PG-PROPERTY-PERFORMANCE-SSOT** — Unify Property Performance onto financial SSOT: drop overview parallel KPI cache; migrate ops/collections PG pages to `revenue.byPg`; audits + parity tests

## 2026-07-28

- [x] **FYH-SERVICES-PROD** — Production Services module: categories, codes, pricing/GST, staff assign, commission, consumables schema, online flags, analytics zeros, search/filters, archive semantics, Luxury Forest UI (`0005`)
- [x] **FYH-PRODUCTS-01** — Products CRUD + retail/consumable flags (`0006`); feeds service kits
- [x] **FYH-STAFF-MIN** — Minimal staff list/create for service assignment (full Staff module later)
- [ ] **FYH-APPOINTMENTS** — Appointments module (uses bookable services only)
- [x] **COLLECTIONS-P3** — Schema 0130 + lateFeePolicy/reminders/receipts/reports/bulk stubs, cron, tests, docs
- [x] **COLLECTIONS-P2** — billing_events schema/service, wire emissions, invoice history surfaces, tests, docs

## 2026-07-27

- [ ] **FYH-NEON** — Provision Neon DB + set `HAIR_DATABASE_URL` / `HAIR_ADMIN_*` on Vercel (domain `fyhair.awesomepg.in` connected)
- [x] **FYH-SHELL-01** — App shell: host routing, auth, layout, theme, placeholder nav (no salon features yet)
- [x] **FYH-HOST-FYHAIR** — Allowlist `fyhair.awesomepg.in` in `isHairHost` (same invest-style routing; www/invest untouched)

## 2026-07-26

- [x] **CAPITAL-INVESTMENT-TRUTH** — Rewrite financial-truth-report for investment-math SSOT (Active Capital = Σ current investment; no Me-stake filter)
- [x] **CAPITAL-NO-FUNDING-SOURCES-020** — Remove Funding Sources ledger/UI; keep payments+costs; Active Capital = stakes
- [x] **CAPITAL-THREE-LEDGERS-019** — *(superseded for funding by ADR-020)*

## 2026-07-11

- [x] **CAPITAL-POOL-01** — Replace Cash Available with Working Capital / Free Cash / Current Investment (rotating pool; no capital double-count)
- [x] **CAPITAL-ROI-01** — Audit/fix Business vs Personal ROI formulas (gross÷purchase volume; my profit÷capital invested; clamp Personal ≤ Business when partner share > 0); unit tests for 20%/10% example
- [x] **OPS-BA-02** — Align sidebar/Overview badges with unified Operations queue totalCount
- [x] **OPS-BA-01** — Fix Booking Approval queue retaining Reserved bookings + broken `/booking/:code` View reservation link
- [x] **CAPITAL-OS-01** — Redesign Overview into Investment OS (KPIs, charts, manual profit, insights, range filters); migration `0003_manual_profits` applied on Neon
- [x] **CAPITAL-OS-02** — Commit + deploy Investment OS Overview to production invest host (`6a9ec49`, verified)

## 2026-07-10 — Automotive Capital

- [ ] **Review Automotive Capital planning docs** — `docs/automotive-capital/` (13 documents); approve before Phase 1 implementation
- [ ] **Provision Neon database** — Create `INVEST_DATABASE_URL` for Capital (separate from PG)
- [ ] **Phase 1 Foundation** — After approval: scaffold `src/capital/`, host middleware, auth, dashboard shell → `docs/automotive-capital/TASKS.md`

## 2026-07-02

- [ ] **P0 Operations Center** — Await approval of `docs/OPERATIONS_CENTER_AUDIT.md`, then implement SSOT-only unified queue (fix electricity/maintenance/financial_audit bugs, status labels, WhatsApp, Pending Reviews + Timeline cleanup)
- [ ] Write `scripts/audit-unified-operations-queue.ts` for count parity vs production DB

## 2026-06-22

- [ ] Add GitHub remote to docs vault and push `main`
- [ ] Open Obsidian on `/Users/aashumotlani/awesomepg/docs` — confirm `TEST_OBSIDIAN_CONNECTION.md` visible
- [ ] Optional: run `./scripts/watch-auto-sync.sh` for background vault sync
- [ ] Resolve parent repo vs docs vault tracking (submodule or ignore `docs/` in app repo)

## 2026-06-21

- [ ] Verify `d4c01c6` vacating/ops fixes in production (Mohd approve flow, Harish settlement)
- [ ] Consolidate duplicate admin vacating/deposit/refund entry points → [[Operations]] only
- [ ] Approve pending move-outs from operations queue
- [ ] Complete in-progress checkout settlements
- [ ] Reduce legacy route bookmarks (`/admin/requests`, `/admin/collections`)

---

## Done

## 2026-07-24

- [x] **APG-2026-0082 tail rent bug** — BR-MOVEIN-COVERAGE in `billingCoverageModel.ts`; Case F + validator test; ops guide `docs/validation/APG-2026-0082-settlement.md` (approve vacating → checkout → elec → payout ~₹2,059 minus meter)

## 2026-06-21

- [x] Create second brain docs (12 core files + domain hubs)
- [x] Pre-commit doc sync hook in app repo
- [x] Fix `/admin/vacating` Date serialization crash (`d4c01c6`)
- [x] Checkout-month rent sync on vacating notice (`369bddb`)
- [x] Bed assignment SSOT alignment (`88a16e8`)
- [x] Initialize docs vault Git + auto-sync scripts

---

## How to append

```markdown
## YYYY-MM-DD
- [ ] Task description (link [[Operations]] or route if admin action)
```

---

## Related

[[active_memory]] · [[CURRENT_STATE]] · [[ideas]] · [[START_HERE]]

<!-- INTEL_2026-06-21T19:59:31Z -->
### 2026-06-21T19:59:31Z

- **Types:**  · REFACTOR ·  · BUG ·  · TASK ·  · DECISION ·  · INSIGHT ·  · FEATURE · 
- **Primary:** BUG
- **Summary:** 4 files changed, 217 insertions(+), 104 deletions(-)
- **Files:**
- `.gitignore`
- `MEMORY/active_memory.md`
- `INTELLIGENCE.md`


<!-- INTEL_2026-06-21T19:59:45Z -->
### 2026-06-21T19:59:45Z

- **Types:**  · REFACTOR ·  · BUG ·  · DECISION ·  · INSIGHT ·  · TASK ·  · FEATURE · 
- **Primary:** BUG
- **Summary:** 11 files changed, 368 insertions(+), 104 deletions(-)
- **Files:**
- `.gitignore`
- `INTELLIGENCE.md`
- `MEMORY/active_memory.md`
- `MEMORY/bugs.md`
- `MEMORY/changelog.md`
- `MEMORY/decisions.md`
- `MEMORY/ideas.md`
- `MEMORY/insights.md`
- `MEMORY/tasks.md`


<!-- INTEL_2026-06-21T20:03:44Z -->
### 2026-06-21T20:03:44Z

- **Types:**  · REFACTOR ·  · BUG ·  · TASK ·  · DECISION ·  · INSIGHT ·  · FEATURE · 
- **Primary:** BUG
- **Summary:** 6 files changed, 360 insertions(+), 59 deletions(-)
- **Files:**
- `.gitignore`
- `INTELLIGENCE.md`
- `MEMORY/active_memory.md`


<!-- INTEL_2026-06-21T20:59:03Z -->
### 2026-06-21T20:59:03Z

- **Types:**  · REFACTOR ·  · BUG ·  · FEATURE ·  · TASK ·  · DECISION ·  · INSIGHT · 
- **Primary:** BUG
- **Summary:** 8 files changed, 328 insertions(+), 6 deletions(-)
- **Files:**
- `AI_SYSTEM_PROMPT.md`
- `BUGS.md`
- `Billing.md`
- `CHANGELOG.md`
- `Checkout Settlements.md`
- `MEMORY/bugs.md`
- `MEMORY/changelog.md`
- `Vacating.md`



### 2026-07-11 — Capital production DNS cutover
- [ ] At GoDaddy DNS for awesomepg.in: add **A** record host `invest` → `76.76.21.21`
- [ ] Confirm `dig +short invest.awesomepg.in` returns `76.76.21.21`
- [ ] Open https://invest.awesomepg.in/login and sign in with seeded admin
- [ ] Optional: point www/apex A records to Vercel `76.76.21.21` if public www still serves lander HTML

## TASK — Capital asset form fields (2026-07-11)
- Update `/assets/new` CreateAssetForm: Manufacturer searchable, Model, Fuel, Year, Ownership (1–3), Purchase Date default today, Purchase Price; remove Registration/VIN/Expected Sale/Variant.
- Migration 0004 + deploy + verify invest production.

## TASK — Capital Overview Investment OS redesign (2026-07-11)
- Redesign `/dashboard` as personal portfolio OS: hero KPIs, 65/35 chart+KPI rows, month nav, portfolio summary, period section; remove best/worst and misleading total capital invested.

## FEATURE — Profit sharing (2026-07-11)
- Per-deal partner vs investor split on sale + manual profit (percentage or fixed). Dashboard shows Gross Business Profit vs My Lifetime Profit; Business ROI vs My ROI. Charts toggle Business / My.

## FEATURE — Capital Additional Income + Dashboard cleanup (2026-07-28)
- Removed Attention Required block + `pendingWork` fetch from Capital Overview.
- New `ac_vehicle_additional_income` ledger (brokerage / commissions / incentives); Gross = Sale − TVI + Additional Income; income never enters TVI/Active Capital. Migration `0015`.

<!-- INTEL_2026-07-28T13:51:08Z -->
### 2026-07-28T13:51:08Z

- **Types:**  · REFACTOR ·  · TASK · 
- **Primary:** TASK
- **Summary:** 2 files changed, 2 insertions(+), 1 deletion(-)
- **Files:**
- `MEMORY/active_memory.md`
- `MEMORY/changelog.md`


<!-- INTEL_2026-07-28T14:00:33Z -->
### 2026-07-28T14:00:33Z

- **Types:**  · REFACTOR ·  · TASK · 
- **Primary:** TASK
- **Summary:** 1 file changed, 1 insertion(+)
- **Files:**
- `MEMORY/changelog.md`


<!-- INTEL_2026-07-28T18:16:39Z -->
### 2026-07-28T18:16:39Z

- **Types:**  · REFACTOR ·  · TASK · 
- **Primary:** TASK
- **Summary:** 4 files changed, 18 insertions(+), 1 deletion(-)
- **Files:**
- `MEMORY/active_memory.md`
- `MEMORY/changelog.md`
- `MEMORY/tasks.md`
- `foryourhair/README.md`

