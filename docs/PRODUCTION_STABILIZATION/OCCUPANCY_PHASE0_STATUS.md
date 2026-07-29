# Occupancy SSOT — Phase 0 status

**Goal (PG-P0-1):** One resolution path from bed facts → admin + public labels + KPI counts.

## Done in repo

| Item | Location |
|------|----------|
| Pure occupancy engine | `src/lib/bedOccupancyEngine.ts` |
| Single resolver | `src/lib/bedOccupancyResolve.ts` |
| Admin bed map | `src/services/pgBedMap.ts` → `resolveBedOccupancy` |
| Public room beds | `src/db/queries/customer.ts` → `resolveBedOccupancy` |
| Batch KPI aggregation | `src/services/bedOccupancyBatch.ts`, `admin.ts` dashboard |
| Parity regression tests | `tests/unit/bedOccupancyAdminPublicParity.test.ts`, `bedOccupancyEngine.test.ts` |
| Booking gate | `src/services/availability.ts` — `isBedAvailable` → `resolveBedOccupancy` |

## Remaining (Phase 0 completion)

- Route **remaining** Tier B loaders in [`OCCUPANCY_SSOT_AUDIT.md`](../OCCUPANCY_SSOT_AUDIT.md) through `fetchBedOccupancyRows` / `resolveBedOccupancy` (notably legacy inline SQL in `customer.ts` **list/browse** paths per audit).
- Expand parity fixtures to monthly/open-ended + manual reserve edge cases.
- Production certification: `shantinagarProductionCertification` occupancySsot gate green on prod.

**PG-P0-4 Operations Center:** partial — unified queue refactored (no legacy task → maintenance injection); full SSOT redesign still per [`OPERATIONS_CENTER_AUDIT.md`](../OPERATIONS_CENTER_AUDIT.md).
