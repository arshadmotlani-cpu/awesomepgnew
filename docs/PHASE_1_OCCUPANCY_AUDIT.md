# Phase 1 Occupancy SSOT — Surface Audit Report

**Date:** 2026-07-02  
**Status:** Phase 1 complete — all display/count surfaces consume `bedOccupancyEngine` via `bedOccupancyResolve` / `bedOccupancyBatch`  
**Feature flag:** Removed (`OCCUPANCY_ENGINE_V2` deleted; engine always on)

## Architecture

```text
SQL facts (occupancySsot + batch lateral joins)
    → bedOccupancyResolve.resolveBedOccupancy()
        → bedOccupancyEngine.computeBedOccupancySnapshot()
        → isOpenNow / isBookable / isOccupiedForKpi / labels
    → bedOccupancyBatch.aggregateOccupancyCounts() for PG/room/global KPIs
```

---

## Surface migration matrix

| File | Surface | Previous calculation | New calculation | Migrated | Notes |
|------|---------|---------------------|-----------------|----------|-------|
| `src/lib/bedOccupancyEngine.ts` | Core SSOT | N/A (new) | `computeBedOccupancySnapshot`, labels, `canBookBedFromSnapshot` | ✅ | Pure engine |
| `src/lib/bedOccupancyResolve.ts` | Resolution layer | N/A (new) | `resolveBedOccupancy`, `isOpenNow`, `isOccupiedForKpi`, aggregates | ✅ | Single entry for all surfaces |
| `src/services/bedOccupancyBatch.ts` | Batch loader | N/A (new) | `fetchBedOccupancyRows` + engine aggregate | ✅ | PG/room/global counts |
| `src/lib/bedAvailabilityState.ts` | Label bridge | 300+ lines legacy branches + flag | Thin wrapper → `resolveBedOccupancy` | ✅ | Legacy deleted |
| `src/lib/bedOccupancyEngineFlag.ts` | Feature flag | `OCCUPANCY_ENGINE_V2` gate | **Deleted** | ✅ | Always on |
| `src/services/pgBedMap.ts` | Admin bed map | TS `isAvailableNow` booleans + `deriveBedAvailabilityView` | `resolveBedOccupancy` per bed; summary from engine flags | ✅ | |
| `src/db/queries/customer.ts` | `listPublicPgs` | Inline SQL `NOT EXISTS active reservation` | `getOccupancyCountsByPg` → `openNowBeds` | ✅ | Browse PG cards |
| `src/db/queries/customer.ts` | `listRoomsForPg` | Same inline SQL per room | `getOccupancyCountsByRoom` → `openNowBeds` | ✅ | Room cards |
| `src/db/queries/customer.ts` | `getRoomDetail` | SQL `isAvailableNow` + `upper(stay_range)` | `resolveBedOccupancy` per bed; `bookableFromDate` from engine | ✅ | Room 102 B1 fix |
| `src/db/queries/admin.ts` | `getDashboardStats` | `bedOccupiedTodayExistsSql` subtract | `getGlobalOccupancyCounts()` | ✅ | Admin KPI row |
| `src/db/queries/admin.ts` | `getOccupancyByPg` | SQL FILTER occupancy | `getOccupancyCountsByPg()` | ✅ | Overview, control board, revenue |
| `src/db/queries/admin.ts` | `getOccupancyByFloor` | SQL FILTER occupancy | `fetchBedOccupancyRows` + aggregate | ✅ | Floor analytics |
| `src/services/roomActivity.ts` | Room insights | Per-bed SQL `isAvailableNow` | `getOccupancyCountsByRoom` | ✅ | `RoomDetailInsights` |
| `src/components/customer/customerBedUi.tsx` | Bed tiles, `canBookBed` | Legacy booleans + flag | `resolveBedOccupancy` / `resolveFromSelectorBed` | ✅ | |
| `src/components/customer/CustomerBedMap.tsx` | Room open/occupied counts | `isAvailableNow` heuristics | `resolveFromSelectorBed` | ✅ | |
| `src/components/customer/block/PgBlockBooking.tsx` | Block room open count | `isAvailableNow` | Upstream `getRoomDetail` engine flags | ✅ | Data layer |
| `app/(customer)/pgs/[pgSlug]/rooms/[roomId]/page.tsx` | `availableNowCount`, `bookableCount` | `nextAvailableDate` heuristic | `isOpenNow` + `canBookBed` | ✅ | |
| `src/components/customer/BedSelector.tsx` | `bookableCount` | Partial `canBookBed` | `canBookBed` (engine) | ✅ | |
| `src/lib/booking/simpleRoomCategory.ts` | Category bed pick | `isAvailableNow` | `resolveFromSelectorBed().isOpenNow` | ✅ | |
| `src/components/admin/PgBedMapPanel.tsx` | Room open/occupied chips | `isAvailableNow` / `isOccupiedToday` | Engine-derived fields from `pgBedMap` | ✅ | |
| `src/components/admin/bedmap/BedMapSummarySection.tsx` | PG summary | `PgBedMapSummary` from pgBedMap | Engine-derived summary | ✅ | |
| `src/components/customer/PgCard.tsx` | "X of Y beds free today" | `listPublicPgs.availableBeds` SQL | Engine `openNowBeds` | ✅ | |
| `src/components/customer/PgBrowseList.tsx` | Browse list | Pass-through | Engine counts | ✅ | |
| `app/(customer)/pgs/page.tsx` | Browse PG page | `listPublicPgs` | Engine counts | ✅ | |
| `app/page.tsx` | Landing strip totals | Sum `availableBeds` | Engine counts | ✅ | |
| `src/components/customer/marketing/LiveAvailabilityStrip.tsx` | Aggregate free beds | Display only | Engine counts | ✅ | |
| `src/components/customer/PgCompareTable.tsx` | Compare availability | `listPublicPgs` | Engine counts | ✅ | |
| `src/components/customer/PgFavoriteButton.tsx` | Favorites badge | `availableBeds` | Engine counts | ✅ | |
| `src/components/customer/RoomCard.tsx` | "X of Y free now" | `listRoomsForPg` | Engine counts | ✅ | |
| `src/components/customer/RoomDetailInsights.tsx` | Activity stats | `getRoomActivityStats` | Engine counts | ✅ | |
| `src/components/admin/overview/OverviewDashboard.tsx` | Per-PG occupancy % | `getOccupancyByPg` | Engine | ✅ | |
| `src/components/admin/AdminOverviewKpiRow.tsx` | Global beds available | `getDashboardStats` | Engine | ✅ | |
| `src/services/controlBoard.ts` | Control board cards | `getOccupancyByPg` | Engine | ✅ | |
| `src/services/overviewDashboard.ts` | Overview metrics | `getOccupancyByPg` | Engine | ✅ | |
| `src/services/businessAnalytics.ts` | Analytics occupancy | `getOccupancyByPg` | Engine | ✅ | |
| `src/services/revenueCommandCenter.ts` | Revenue occupancy | `getOccupancyByPg` | Engine | ✅ | |
| `src/components/world/*` | Room spine cards | `availableBeds/totalBeds` from room list | Engine counts upstream | ✅ | |
| `src/lib/roomWorld/dnaSpineLayout.ts` | `occupancyRatio`, labels | Display math on upstream counts | Engine counts upstream | ✅ | |
| `src/lib/publicPgAvailabilityOverrides.ts` | IT Park / Central Avenue | Force occupied on public | **Keep** — applied after engine on pages | ✅ | Override layer, not occupancy calc |
| `app/(customer)/pgs/[pgSlug]/page.tsx` | PG detail bed merge | `isPublicAlwaysOccupiedPg` | Override after engine resolution | ✅ | |

---

## Intentionally deferred (not display/count surfaces)

| File | Surface | Reason |
|------|---------|--------|
| `src/services/availability.ts` | Date-range overlap / free windows | **Deferred** — future-date booking pivot; not "today" occupancy display. Range API unchanged in Phase 1. |
| `src/services/booking.ts` | Pre-flight `isBedAvailable` | **Deferred** — booking mutation guard for arbitrary stay ranges, not occupancy labels. |
| `src/services/extension.ts` | Extension overlap check | **Deferred** — same as booking guard |
| `src/services/expressBookingSale.ts` | Express booking guard | **Deferred** — mutation guard |
| `src/services/tenantAssignment.ts` | Assignable beds list | **Deferred** — uses range availability; admin assign flow |
| `src/services/occupancyDiagnostics.ts` | Drift diagnostics | **Diagnostic** — compares DB facts; not customer-facing |
| `src/lib/occupancySsot.ts` | SQL EXISTS fragments | **Internal** — data-fetch predicate only; consumed by batch loader |
| `app/api/availability/route.ts` | Range availability API | **Deferred** — uses `getPgAvailability` range logic |

---

## Scenario verification (engine unit tests + wiring)

| Scenario | Expected public label | Expected admin | Engine test / wiring |
|----------|----------------------|----------------|----------------------|
| **IT Park Browse card** | Override → all beds show occupied; `availableBeds=0` before override on card, page forces occupied | N/A public | `isPublicAlwaysOccupiedPg` on PG/room pages; browse count from engine then overridden in UI |
| **Central Avenue Male Browse card** | Same as IT Park | N/A | Same override |
| **Shanti Nagar Browse card** | Engine `openNowBeds` / per-bed labels | Admin map via `pgBedMap` | `listPublicPgs` → batch engine |
| **Room 102 B1 (monthly)** | **Occupied** — not "Available soon Until Aug" | Occupied, no pre-book | `bedOccupancyEngine.test.ts` monthly + `getRoomDetail` resolve |
| **Fixed stay (checked in)** | Occupied · "Available from {checkout+1}" | Same | `bedOccupancyEngine.test.ts` fixed |
| **Monthly stay (checked in)** | Occupied, no until-date from billing period | Not pre-bookable | Engine monthly branch |
| **Notice period** | Notice period / leaving date | Notice · leaves {date} | `vacatingPastDue.test.ts` (requires `isOccupiedToday`) |
| **Reserved bed** | Held / Booked | Reserved | Engine `publicState=reserved` |
| **Maintenance bed** | Maintenance | Maintenance | Engine short-circuit |
| **Checkout pending (monthly)** | Occupied (public); not bookable | Checkout pending · open settlement | `bedOccupancyEngine.test.ts` monthly mandatory |
| **Checkout pending (fixed, suppressed)** | Available after buffer | Available | `bedOccupancyEngine.test.ts` fixed workflow-only |

---

## Removed duplicated logic

1. **Deleted** ~250 lines legacy label branches in `bedAvailabilityState.ts`
2. **Deleted** `bedOccupancyEngineFlag.ts` and all flag checks
3. **Replaced** 4 independent SQL count paths (`listPublicPgs`, `listRoomsForPg`, `getDashboardStats`, `getOccupancyByPg`) with single batch + aggregate
4. **Replaced** `pgBedMap` hand-rolled `isAvailableNow` with `resolveBedOccupancy().isOpenNow`
5. **Replaced** room page `bookableCount` heuristic (`nextAvailableDate` truthy) with `canBookBed` (engine)
6. **Replaced** `CustomerBedMap` open/occupied heuristics with `resolveFromSelectorBed`

---

## How to verify in staging

1. Browse `/pgs` — IT Park & Central Avenue show 0 free (override on detail); Shanti Nagar shows engine counts
2. Room 102 — B1 monthly shows **Occupied**; fixed beds show **Available from** when applicable
3. Admin bed map — checkout pending shows admin-only label; summary counts match per-room chips
4. Dashboard KPIs — occupancy % matches bed map totals for a PG

---

## Phase 2+ not started

- Maintenance engine short-circuit enhancements (Phase 2)
- Reservation product lifecycle (Phase 2b)
- Schema migration / unbounded monthly ranges (Phase 3 — gated)
