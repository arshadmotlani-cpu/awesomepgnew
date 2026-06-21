# Active Memory

> **Live system state** — updated when focus, priorities, or constraints change.  
> Formal snapshot: [[CURRENT_STATE]] · Classified log: [[tasks]] · [[ideas]]

---

## Current Focus

- **Semantic Intelligence Layer** — `brain-semantic.sh` → intent + impact + `Semantic State`
- Git-backed vault synced to https://github.com/arshadmotlani-cpu/awesomepg-docs
- Stabilize vacating / checkout ops post-`d4c01c6` deploy
- Consolidate admin actions into [[Operations]] + module hubs

---

## Current Blockers

- None for vault sync (GitHub push working via SSH)
- Post-deploy verification of vacating/ops fixes still pending ([[tasks]])

---

## Latest Decisions

See [[decisions]] · Recent: MEMORY engine + `docs/.cursor/rules.md` + `brain-sync.sh` (2026-06-22)

---

## Top 5 Priorities

1. Verify `/admin/vacating` and [[Operations]] move-out queue end-to-end in production
2. Approve pending move-outs (e.g. Mohd Aatif — notice filed, not approved)
3. Complete checkout settlements in progress (e.g. Harish)
4. Reduce duplicate vacating/deposit/refund CTAs across admin UI
5. Keep MEMORY/ append-only — classify all new info before writing elsewhere

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

> **Last run:** 2026-06-21T20:03:44Z  
> **Primary type:** BUG  
> **All types:**  · REFACTOR ·  · BUG ·  · TASK ·  · DECISION ·  · INSIGHT ·  · FEATURE ·   
> **Files:** 3

<!-- AGENT_STATUS_END -->



<!-- INTELLIGENCE_DELTAS_START -->
### 2026-06-21T20:03:44Z — review recommended

- **Signal:** BUG change in project state files
- **Action:** Verify Current Focus / Blockers / Priorities still accurate
- **Trigger files:** .gitignore,INTELLIGENCE.md,MEMORY/active_memory.md

<!-- INTELLIGENCE_DELTAS_END -->


<!-- SEMANTIC_STATE_START -->
## Semantic State

> **Last analyzed:** 2026-06-21T20:04:15Z

- **Current system intent:** The AI memory / intelligence automation layer is being extended — cognition pipeline or MEMORY structure changed.
- **Dominant change type:** MIXED (see changelog)
- **System momentum:** HIGH (7 vault commits in 24h)
- **Risk level:** LOW

<!-- SEMANTIC_STATE_END -->
