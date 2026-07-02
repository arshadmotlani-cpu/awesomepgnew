# Phase 5 — Occupancy SSOT — Approval Request

**Status:** Awaiting stakeholder approval before Phase 0 implementation  
**Date:** 2026-07-02  
**Reference:** [`docs/OCCUPANCY_SSOT_AUDIT.md`](../OCCUPANCY_SSOT_AUDIT.md), [`docs/BED_EXPLORER_SSOT_PLAN.md`](../BED_EXPLORER_SSOT_PLAN.md)

---

## Problem

Admin bed map and public PG page use **6+ independent compute paths** for the same bed. Example: Room 102 B1 shows **Occupied** on admin but **Available soon** on public browse.

This is a **data-truth P0** issue — affects booking conversion, express booking bed selection, and resident trust.

---

## Proposed Phase 0 (no implementation until approved)

1. Introduce `bedOccupancyEngine.ts` as single compute SSOT
2. Feature flag `OCCUPANCY_ENGINE_V2` (per prior plan docs)
3. Parity tests: admin tile === public tile === express booking gate for fixture bookings
4. No UI patches until engine passes parity suite

---

## Scope

| In scope | Out of scope |
|----------|--------------|
| Bed availability labels (admin, public, resident) | Full Bed Explorer redesign (later phase) |
| `pgBedMap.ts`, `customer.ts` bed queries | Pricing engine changes |
| Express booking `isBedAvailable` | Historical booking migrations |

---

## Risks if deferred

- Continued wrong public availability (lost bookings or double bookings)
- Each surface fix creates new drift
- BOOK-MODEL-01 (open_ended + finite checkout) remains unfixed on public path

---

## Effort estimate

| Phase | Effort |
|-------|--------|
| Phase 0 engine + parity tests | 2–3 weeks |
| Surface migration | 2–3 weeks |
| **Total** | **4–6 weeks** |

---

## Approval checklist

- [ ] **Product owner** approves Phase 0 engine approach
- [ ] **Engineering** approves feature-flag rollout plan
- [ ] **Ops** accepts temporary parity monitoring during migration
- [ ] Unblock `docs/MEMORY/active_memory.md` occupancy SSOT blocker

---

## Rollback strategy

- Feature flag off → revert to legacy compute paths
- No schema migration required for Phase 0

---

## Decision

| Approver | Decision | Date |
|----------|----------|------|
| _Pending_ | Approve / Defer / Modify scope | |

**Action when approved:** Create implementation epic; begin `bedOccupancyEngine.ts` + parity tests only.
