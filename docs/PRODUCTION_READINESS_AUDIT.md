# Production Readiness Audit (post W0–W4)

Canonical classification after stabilization waves. **Do not edit** the Cursor plan file; update this doc when status changes.

**Hair release bar:** RC scope ([`docs/foryourhair/RELEASE_READINESS.md`](../foryourhair/RELEASE_READINESS.md)).

## Summary

| Category | Material items |
|----------|----------------|
| Production Blocker | PB-1 occupancy (partial), PB-2 ops (partial — queue refactored) |
| Operational | OP-1–OP-8 — see [`ENV_CONTRACT.md`](../ENV_CONTRACT.md) |
| Manual Verification | MV-1–MV-6 — see [`PRODUCTION_READINESS_SIGNOFF.md`](./PRODUCTION_READINESS_SIGNOFF.md) |
| Deferred Backlog | [`MEMORY/tasks.md`](../MEMORY/tasks.md) `STABILIZATION-W4-REMAINDER` |

## Production blockers

### PB-1 — Occupancy SSOT (partial)

- **Done:** `isBedAvailable` → `fetchBedOccupancyRows` + `resolveBedOccupancy` ([`src/services/availability.ts`](../../src/services/availability.ts)).
- **Remaining:** Customer list/browse SQL paths — [`OCCUPANCY_PHASE0_STATUS.md`](./OCCUPANCY_PHASE0_STATUS.md).

### PB-2 — Operations Center

- Unified queue no longer injects legacy `getOperationsCenterData` tasks into maintenance ([`src/services/unifiedOperationsQueue.ts`](../../src/services/unifiedOperationsQueue.ts)).
- Refund rows use `refundConsoleHref` (~L280).
- Residual electricity lifecycle / audit chip issues may remain — see [`OPERATIONS_CENTER_AUDIT.md`](../OPERATIONS_CENTER_AUDIT.md).

## Product readiness (snapshot)

| Product | ~% | Blockers |
|---------|-----|----------|
| Awesome PG | 75 | PB-1 remainder; MV-1–3 |
| APG OS Admin | 70 | PB-2 residual; MV-6 |
| Hair ERP | 88 | OP-3/6; MV-4 |
| Capital OS | 82 | OP-4; MV-5 |

**Hair + Capital (RC scope):** Feature work complete for agreed scope; deploy + verify remain.

**PG + Admin:** PB-1/PB-2 + prod audits before P0 sign-off.
