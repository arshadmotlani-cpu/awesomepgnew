# Phases 2, 2B & 3 — Implementation Report

**Date:** 2026-07-02  
**Status:** Implemented · 871 unit tests passing · **not committed** (per request)

---

## Summary

All approved Phase 2 (Maintenance), Phase 2B (Reservation), and Phase 3 (Monthly lifecycle + deposit policy) work is implemented on top of the completed Phase 1 occupancy SSOT engine.

---

## Phase 2 — Maintenance

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Beds under maintenance appear RED everywhere | ✅ | `computeBedOccupancySnapshot` → `publicState: maintenance`; customer/admin labels **Under Maintenance** |
| Cannot be booked / reserved | ✅ | `isBedAvailable` rejects non-`available` beds; `canBookBedFromSnapshot`; `canOfferBedReserve` |
| Cannot generate rent | ✅ | `billingScheduler.listAnniversaryCandidates` excludes `beds.status = maintenance` |
| Excluded from occupancy KPIs | ✅ | `aggregateOccupancyCounts` denominator excludes maintenance + blocked beds |
| Admin mark/unmark | ✅ | Existing `AdminBookingOpsPanel` bed status toggles |
| Public label | ✅ | **Under Maintenance** on map + room pages |
| Overrides all states | ✅ | First branch in `computeBedOccupancySnapshot` |

---

## Phase 2B — Reservation

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Future check-in; reserve ends on check-in | ✅ | `bed_reserve_holds.check_in_date` |
| No deposit during reserve | ✅ | `createBedReserve` `depositPaise: 0` |
| Fee = 50% optimized fixed-stay rent | ✅ | `quoteBedReserve` → `computeLowestFixedStayRent` + `reserveFeePaise` |
| **Reserved until &lt;date&gt;** | ✅ | `toCustomerAvailabilityView` / admin views |
| Fixed stays until check-in − 1 day buffer | ✅ | `reserveShortStayEndExclusive` → `reserveBufferDate`; `validateShortStayDuringReserve` |
| Monthly blocked during reserve | ✅ | `reserveBlocksLongStay` in `createBooking` |
| Auto-convert on check-in | ✅ | `processDueBedReserveConversions` / `convertBedReserveToMonthlyStay`; cron `/api/cron/expire-bed-reserves` |
| Admin cancel/edit | ✅ | Existing `cancelBedReserveByCustomer`, `extendBedReserve` |

---

## Phase 3 — Monthly lifecycle

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Migration `0094_monthly_lifecycle_deposit_policy` | ✅ | PG/room deposit policy, `billing_anchor_date`, unbounded monthly `stay_range` repair SQL |
| Unbounded `[check_in,)` | ✅ | `createBooking` open-ended `daterange(start, NULL, '[)')` |
| Remove 2099 sentinel logic | ✅ | `vacating.restoreOpenEndedStay`, `tenantAssignment`, `expressBookingSale`, `bookingStayDateIntegrity` |
| `expected_checkout_date` not used for monthly availability | ✅ | Engine uses vacating / `bookableFromDate`; monthly bookings store `NULL` checkout |
| `billing_anchor_date` | ✅ | Set on monthly `createBooking`; migration backfill |
| `FIXED_DATE_MAX_NIGHTS = 29` | ✅ | `src/lib/stayType.ts` |
| Deposit PG → room → bed | ✅ | `resolveMonthlyDepositPaise`; `loadBedPrice` joins PG/room policy |
| PG admin UI | ✅ | `PgAdminForm` one/two month selector; `pgAdmin` + actions |
| Repair script | ✅ | `scripts/repair-monthly-stay-ranges.ts` |
| Checkout pending holds bed until settlement | ✅ | `fixedStayAutoExpiry` shortens `stay_range`, creates settlement, **does not** complete booking early |

---

## Deposit policy defaults (migration seed)

| PG | Policy |
|----|--------|
| Shanti Nagar | One month |
| IT Park / Central Avenue Male | Two month |
| Fixed stays | 50% of rent subtotal (unchanged) |

---

## Key files changed

- `src/lib/bedOccupancyEngine.ts` — maintenance labels, reserved copy, checkout-pending fix
- `src/lib/bedOccupancyResolve.ts` — KPI denominator excludes maintenance
- `src/services/booking.ts` — unbounded monthly stays, `billing_anchor_date`
- `src/services/bedReserve.ts` — optimized reserve pricing, auto-convert
- `src/services/pricing.ts` — deposit inheritance via PG/room
- `src/services/vacating.ts`, `fixedStayAutoExpiry.ts` — lifecycle / checkout pending
- `src/services/billingScheduler.ts` — no rent on maintenance beds
- `src/services/pgAdmin.ts`, `PgAdminForm.tsx` — deposit policy admin
- `src/db/migrations/0094_monthly_lifecycle_deposit_policy.sql`

---

## Verification

| Check | Method |
|-------|--------|
| Unit tests | `npm test` → **871 pass** |
| Room 102 B1 / scenarios | `scripts/investigate-room102-harshal.ts` (existing) |
| Monthly repair (dry-run) | `npx tsx scripts/repair-monthly-stay-ranges.ts --dry-run` |

### Manual smoke (recommended before deploy)

1. Mark a bed **Maintenance** → red on admin map, public room, PG browse; not bookable
2. Create bed reserve → 50% optimized rent quote; label **Reserved until …**
3. Book fixed stay ending day before reserve buffer → allowed; monthly → blocked
4. New monthly booking → `stay_range` upper `NULL`, `billing_anchor_date` = check-in
5. IT Park monthly quote → two-month deposit; Shanti Nagar → one month
6. Fixed stay past checkout → bed stays checkout-pending until settlement completes

---

## Not in scope / follow-ups

- Phase 4 settlement ₹680 RCA
- Room-level deposit policy admin UI (schema ready; PG-only UI per plan)
- E2E Playwright pass against staging DB with migration 0094 applied

---

## Commit gate

Do **not** commit until stakeholder sign-off on this report and staging smoke above.
