# Ecosystem Baseline v1

**Frozen:** 2026-08-05  
**Internal tag:** `Ecosystem Baseline v1`  
**Status:** Permanent minimum quality standard for the Awesome PG ecosystem.

Cross-links: [[STABILITY_PHASE]] · [[ECOSYSTEM_V2]] · [[ECOSYSTEM_V2_BRAIN_REGISTRY]] · ADR-ECO-001 · Health Brain (`src/lib/health/`)

---

## What is frozen

Wave 1–3 Health Brain work reached **Health Score = 100** with every registered Brain Healthy and zero open integrity issues on production audit (`tmp/brain-integrity-wave3.json`, independent re-verify via `scripts/independent-ecosystem-baseline-audit.ts`).

This state is the **floor**, not a peak. Future work must not regress below it.

---

## Registration law

### Every new Engine

Must register with the Health Brain (hub + cron/UI surface) before it is considered shipped.

### Every new Brain

Must provide all of:

| Capability | Requirement |
|------------|-------------|
| Integrity audit | Deterministic detector(s); no silent swallow |
| Health score | Contributes to overall Ecosystem Health; 100 only when Healthy |
| Repair engine | Registered repair fns; auto only when 100% deterministic |
| Events | Durable issue/repair events (or equivalent brain_repair_* trail) |
| Audit trail | `audit_log` / brain repair history for every mutation |
| Performance metrics | Duration / rows / failures on repair runs |

---

## Definition of done (permanent)

No feature is complete until **all** of the following are true:

- [ ] Build passes (`npm run build`)
- [ ] Tests pass (scoped product suite, e.g. `npm run test:pg`)
- [ ] Stability passes (`npm run stability:report` green)
- [ ] Brain Health passes (live integrity audit — no open P0/P1/P2 on affected brains)
- [ ] **Health Score remains 100**
- [ ] **No existing Brain regresses** (status Healthy → Warning/Critical is a hard fail)

If any change causes Health Score **&lt; 100**, the change is **incomplete** until fixed. Do not ship, merge, or close the task.

---

## Score honesty

- Overall Health Score is **100 only when every Brain is Healthy**.
- Cached Owner Dashboard snapshots must not be used as the sole acceptance signal — acceptance requires a **live** recompute (`runAllBrainIntegrityAudits` / independent baseline audit).
- Auto-repairs never invent residents, bookings, invoices, readings, or money rows.

---

## Verification commands

```bash
# Live integrity + optional safe repairs (Wave 3 artifact)
npx tsx --tsconfig tsconfig.json scripts/write-brain-integrity-wave3.ts

# Independent Baseline v1 verification (no repairs; compares live vs stored)
npx tsx --tsconfig tsconfig.json scripts/independent-ecosystem-baseline-audit.ts

# Stability gate
npm run stability:report
```

---

## Relation to Stability Phase

[[STABILITY_PHASE]] remains the change workflow (dependents → tests → report).  
**Ecosystem Baseline v1** adds the Brain Health / Health Score = 100 gate on top of that workflow.
