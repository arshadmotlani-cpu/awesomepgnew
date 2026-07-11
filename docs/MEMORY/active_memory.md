# Active Memory

> **Live system state** — updated when focus, priorities, or constraints change.  
> Formal snapshot: [[CURRENT_STATE]] · Classified log: [[tasks]] · [[ideas]]

---

## Current Focus

- **Automotive Capital Investment OS Overview** — Shipped to production (`6a9ec49`); invest Overview + manual profits verified live (19/19 checks). Neon migration already applied.

- **Automotive Capital host routing** — Root cause: Capital code was never on `main`; production git deploys served Awesome PG on invest. Fix: commit Capital + harden host/`x-forwarded-host` allowlist middleware.

- **Automotive Capital production deploy** — App live on invest host; DNS resolved via Vercel. Admin credentials synced for both apps.

- **Operations Center P0 redesign** — Phase 1 audit complete (`docs/OPERATIONS_CENTER_AUDIT.md`); awaiting approval before implementation. Goal: true action center only, invoice/payment SSOT, no duplicate queues.
- **Occupancy SSOT** — Critical: Admin bed map ≠ Public PG page for same bed; audit complete, implementation blocked on approval → `docs/OCCUPANCY_SSOT_AUDIT.md`
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

See [[decisions]] · Recent: MEMORY engine + `docs/.cursor/rules.md` + `brain-sync.sh` (2026-06-22)

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

> **Last run:** 2026-06-21T20:59:03Z  
> **Primary type:** BUG  
> **All types:**  · REFACTOR ·  · BUG ·  · FEATURE ·  · TASK ·  · DECISION ·  · INSIGHT ·   
> **Files:** 8

<!-- AGENT_STATUS_END -->




<!-- INTELLIGENCE_DELTAS_START -->
### 2026-06-21T20:59:03Z — review recommended

- **Signal:** BUG change in project state files
- **Action:** Verify Current Focus / Blockers / Priorities still accurate
- **Trigger files:** AI_SYSTEM_PROMPT.md,BUGS.md,Billing.md,CHANGELOG.md,Checkout,Settlements.md,MEMORY/bugs.md,MEMORY/changelog.md,Vacating.md

<!-- INTELLIGENCE_DELTAS_END -->



<!-- SEMANTIC_STATE_START -->
## Semantic State

> **Last analyzed:** 2026-07-11T06:49:12Z

- **Current system intent:** The AI memory / intelligence automation layer is being extended — cognition pipeline or MEMORY structure changed.
- **Dominant change type:** MIXED (see changelog)
- **System momentum:** LOW (1 vault commits in 24h)
- **Risk level:** LOW

<!-- SEMANTIC_STATE_END -->


