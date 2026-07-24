# Memory — Decisions

> **Append-only** log of decisions made (operational + strategic).  
> Formal ADRs with full rationale: [[DECISIONS]] (do not duplicate — cross-link instead).

**Rule:** One bullet per decision. Never delete entries.

---

## 2026-07-11

- **Partnership profit model (Sufii + Investor Pool)** — Net Vehicle Cost = purchase + repairs − refunds. Capital stakes must always equal Net Cost. Business Profit → Settings% to operating partner (Sufii, default 50%) + remainder Investor Pool split by stake. Sale enters only price + date. SSOT: `src/capital/lib/dealEconomics.ts`, migration `0008_deal_economics`. → `docs/automotive-capital/DECISIONS.md` ADR-011
- **Multi-investor vehicle funding** — Each asset has business layer (purchase/sale/expenses) and investment layer (`ac_asset_investors`). Stakes must sum to purchase price. Business ROI = profit ÷ purchase price. My ROI = my profit ÷ my invested capital. Profit defaults to proportional to capital. SSOT: `src/capital/lib/investors.ts`, migration `0006_asset_investors`.
- **Rotating working-capital pool** — Dashboard models a continuous capital pool, not an accounting ledger. Working Capital = Initial Capital + My Lifetime Profit. Free Cash = Working Capital − Current Investment − Capital in Transit. Selling recycles capital; only profit increases wealth. SSOT: `src/capital/lib/workingCapital.ts`.
- **ROI formulas (Business vs Personal)** — Business ROI = Gross Business Profit ÷ Lifetime Purchase Volume. Personal ROI = My Profit ÷ My Capital Invested. When partner share > 0, Personal is clamped ≤ Business so a 50:50 equal-capital deal shows ~half (e.g. 20% / 10%). Per-vehicle ROIs use total investment (purchase + expenses) as the shared base. SSOT: `src/capital/lib/roi.ts`.
- **Manual profits are first-class ledger credits** — Non-vehicle profits (`ac_manual_profits`) post `manual_profit` ledger credits and roll into Overview KPIs, ROI, monthly profit series, cash-flow exports, and activity — not a side table ignored by totals

## 2026-07-10

- **Automotive Capital architecture** — Host-based routing in same Next.js app; separate Neon DB (`INVEST_DATABASE_URL`); asset-first polymorphic schema; append-only ledger with reversals; custom DB sessions; Vercel Blob; shadcn/ui; code under `src/capital/` → `docs/automotive-capital/DECISIONS.md` (ADR-001–010)

## 2026-07-02

- **Booking Lifecycle SSOT** — Approved plan: 5 public bed states + admin `checkout_pending`; unbounded monthly `stay_range`; deposit policy PG→room→bed inheritance (PG UI only); Phase 1→2→2b→3→4 → `docs/BOOKING_LIFECYCLE_SSOT_PLAN.md`
- **Resident Portal V2** — Consolidated 9 tabs into 5; Profile owns stay + wallet; Payments owns due + paid history; move-out merged into Requests; referral + room-shift backends added. Defaults: `docs/MEMORY/decisions-resident-portal-v2.md`

## 2026-06-22

- Adopted **MEMORY/** folder for auto-structured AI memory (ideas, tasks, insights, mistakes, decisions, active_memory)
- Moved system docs to `SYSTEM/` and project inventory to `PROJECT/features.md` — vault structure enforced
- Docs vault is standalone Git repo at `/Users/aashumotlani/awesomepg/docs` with fswatch auto-sync scripts

## 2026-06-21

- Maintain `/docs` as Obsidian-compatible second brain; update on every code change ([[DECISIONS#Documentation second brain]])
- On vacating submit/approve, auto pro-rate checkout-month rent via `vacatingCheckoutBilling.ts` ([[DECISIONS#Vacating checkout rent sync]])
- Split vacate notice from deposit refund — meter/UPI only after approve + vacate date ([[DECISIONS#Split vacate request from deposit refund]])
- Primary operator actions live in [[Operations]] queue ([[DECISIONS#Operations as action hub]])
- Serialize `Date` → ISO before passing to client components ([[DECISIONS#Client Date serialization]])
- Align bed map and residents list via `occupancySsot.ts` ([[DECISIONS#Bed assignment SSOT alignment]])

---

## How to append

```markdown
## YYYY-MM-DD
- Decided to … (link [[DECISIONS#…]] if formal ADR exists)
```

---

## Related

[[active_memory]] · [[DECISIONS]] · [[insights]] · [[AI_CONTEXT]]

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


## DECISION — Asset create form fields (2026-07-11)
- Registration/VIN/expected sale not collected on create; registration nullable in DB. Ownership capped at third owner. Fuel type enum: petrol/diesel/cng/ev/hybrid.

## DECISION — Overview capital metrics (2026-07-11)
- Current Investment = SUM(total_investment) on active vehicles. Lifetime Purchase Volume = SUM(purchase_price) all non-cancelled. Lifetime Profit = payment profits + manual. Overall ROI = profit / purchase volume. Cash ≈ capital injected − current investment + lifetime profit. Not a multi-investor dealership product.

## DECISION — Profit sharing (2026-07-11)
- Each sale/manual profit stores its own split. Business ROI = gross ÷ purchase volume. My ROI = my share ÷ capital invested. Existing deals backfilled 100% to investor.

## DECISION — Move-out Operations action queue (2026-07-24)
- Operations must not list approved move-outs waiting on residents. Admin work returns only for pending notice approval or post-resident checkout (`awaiting_admin_review` / `refund_pending`). SSOT: `moveOutRequiresAdminActionNow` in `src/lib/operations/moveOutAdminAction.ts`. Move-out Pipeline remains tracking-only for approved stays.

## DECISION — Move-out workflow permanent rules (2026-07-24)
- **Operations:** admin-action-now only; row leaves the moment the action completes (not history). **Notifications:** same — notify only when attention required; resolve/archive on handle. **`/admin/vacating`:** lifecycle tracker from creation through completion (where / who waits / expected date / next step). **Booking financial workspace:** settlement and money only — workflow stage display reads `deriveMoveOutWorkflowStage`; approve/reject only on pipeline/Operations. **Resident:** simplified stage copy (meter+UPI on vacate date → PG verification → completed). SSOT: [`moveOutWorkflowStages.ts`](src/lib/moveOut/moveOutWorkflowStages.ts) + [`moveOutRequiresAdminActionNow`](src/lib/operations/moveOutAdminAction.ts).

## DECISION — Move-out five-stage workflow pipeline (2026-07-24)
- **Operations / notifications:** admin-action-now only (pending notice, settlement review, refund ready). **`/admin/vacating`:** full pipeline — Pending → Waiting for Vacating Date → Settlement Review → Refund Ready → Completed. Display SSOT: `deriveMoveOutWorkflowStage` in `src/lib/moveOut/moveOutWorkflowStages.ts`. Checkout settlement ops rows route to Operations **Move-out** chip (`vacating_requests`), not `refund_due`. Waiting stage next action copy: meter photo + UPI upload.

## DECISION — Vacating final-period rent billing (2026-07-24)
- **Approved move-out only:** suppress the next pending anniversary rent invoice when vacating falls inside an unpaid billing period before period end; collect tail rent (inclusive calendar days from tail start through vacate) in checkout settlement V2 deposit deductions — not as a separate monthly invoice. SSOT: `src/lib/billing/vacatingFinalPeriodRent.ts`; sync via `syncVacatingCheckoutRentBilling`; generation gate in `generateRentInvoicesForMonth`. Pending notices do not suppress.

## DECISION — Settlement preview tail simulation (2026-07-24)
- **Invoice suppression** stays gated on approved vacating (unchanged). **Settlement estimates** (approval dialog, financial workspace, resident portal) use `treatAsApprovedForTail: true` via `src/lib/vacating/computeVacatingSettlementPreview.ts` so projected tail rent and refundable deposit match post-approval V2 waterfall. Single SSOT: `buildVacatingSettlementPreview` / `computeVacatingSettlementWaterfall`; legacy `estimatedRefundPaise = deposit − row.deduction` overwritten from waterfall on async approval preview.

## DECISION — Billing coverage model (2026-07-24)
- **SSOT:** `src/lib/billing/billingCoverageModel.ts` + `loadBillingCoverageModel` in `src/services/billingCoverage.ts`. Separates: clamped **paid invoice coverage**, **current billing period**, **paid until / prepaid after vacate** (notice), **days paid for settlement**, **tail rent / final invoice suppression**. Invoice-derived periods are clamped to `moveInDate` — never display coverage starting before check-in. All move-out/settlement/notice/tail/monthly snapshot loaders consume this model; no surface derives its own coverage list.

## DECISION — Billing coverage cleanup complete (2026-07-24)
- **`loadVacatingBillingPresentation`** bundles coverage + notice display + V2 waterfall + `EstimatedSettlementPreview`. UI never reads `notice_breakdown_json` for display. **`loadPaidRentCoveragePeriods`** removed; tail Case B = one day when vacate is one day after first unpaid day. Docs: `docs/BILLING_COVERAGE_MODEL.md`.

## DECISION — Krishna post-approve E2E gate (2026-07-24)
- **Feature sign-off for Krishna (APG-2026-0048)** requires `./scripts/run-krishna-post-approve-e2e.sh` exit 0 after admin approve (10 DB checks + Playwright). As of 2026-07-24 vacating still **pending** — Playwright clean; full tail/suppression checks blocked until approve. Regression: approved APG-2026-0045 passed all 10 DB checks on prod DB.

## DECISION — Settlement presentation audiences (2026-07-24)
- **One screen, one audience.** Same `SettlementStatementDocumentModel`; presentation via `applySettlementPresentationAudience` in `src/lib/vacating/settlementPresentationAudience.ts`. **Resident:** refund + leaving (+ pending checklist); optional plain “what affects refund” only. **Admin review:** `AdminReviewSettlementScan` (refund, leaving, notice status, link to statement) — no full statement scroll in approve modal. **Accountant:** financial workspace + statement page/PDF + checkout audit — full explainability and audit trail. Forbidden in default resident/admin UI: rent consumed, waterfall, BR-* IDs, formulas, engine trace. Guide: `docs/validation/SETTLEMENT_UX_GUIDE.md`.

## DECISION — Move-out approval requires settlement review dialog (2026-07-24)
- **No direct approve** from Operations list label: primary CTA is **Review move-out** → modal with **AdminReviewSettlementScan** (refund, leaving, notice) and link to full statement for accounting. **Approve move-out** confirm disabled until `estimatedSettlement` loads. Operations and `/admin/vacating` share `loadPendingVacatingApprovalPreviews` / async preview SSOT. Bed map deep-links to Operations Move-out queue instead of `ApproveVacatingButton` without preview.

## DECISION — Move-out settlement explainability SSOT (2026-07-24)
- Every displayed settlement amount must expose value, formula, business rule, and source via `buildMoveOutSettlementExplanations`. `validateMoveOutSettlementExplanations` checks waterfall, BCM tail/notice wiring, and UI row parity. Unexplainable or inconsistent values are bugs. Production audit: `scripts/audit-active-moveout-settlement-explanations.ts` (all non-terminal active move-outs).

## DECISION — Settlement business rules SSOT (2026-07-24)
- **Canonical rule book:** `docs/BILLING_SETTLEMENT_BUSINESS_RULES.md` (BR-* ids). Engine invariant registry: `docs/BILLING_ENGINE_INVARIANTS.md` (INV-* + failure signatures). Phase 0 proof-first: no engine patches until production matrix + verdict; fix by signature in shared modules only. Reports: `docs/validation/PHASE0_VERDICT.md`, `docs/validation/ACTIVE_MOVEOUT_PHASE0_MATRIX.md`; generator `scripts/report-phase0-moveout-validation-matrix.ts`.

## DECISION — Settlement invalid if any invariant fails (2026-07-24)
- **SSOT validator:** `src/lib/billing/billingEngineValidation.ts` + `validateBillingEngineSettlement`. All move-out surfaces load `loadVacatingBillingPresentationBundle` with explainability. Production gate: `scripts/validate-active-moveout-billing-engine.ts` (14/14 pass post `alignCoverageToLockedWaterfall`). No resident-specific settlement SQL — `docs/SETTLEMENT_REPAIR_POLICY.md`. Final report: `docs/BILLING_SETTLEMENT_ENGINE_FINAL_REPORT.md`.

## DECISION — Settlement engine frozen; UX-only phase (2026-07-24)
- Billing & Settlement Engine is **feature complete**. Do not change settlement mathematics unless invariant/prod validation fails or a **BR-*** rule changes. Ongoing work: UX tiering (15s resident / 10s admin approve / accountant expandables). Policy: `docs/SETTLEMENT_ENGINE_FREEZE.md`, `docs/validation/SETTLEMENT_UX_GUIDE.md`, Cursor rule `.cursor/rules/settlement-engine-freeze.mdc`.
