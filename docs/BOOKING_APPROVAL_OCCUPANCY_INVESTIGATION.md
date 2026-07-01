# Booking Approval → Occupancy Parity Investigation

**Status:** Root cause identified — fix approved pending implementation  
**Date:** 2026-07-02  
**Incident:** Admin bed map shows Occupied (e.g. Dhruv until 1 Aug 2026); Public PG page shows **Available soon** for the same bed after admin approves payment proof.

Related: [`OCCUPANCY_SSOT_AUDIT.md`](./OCCUPANCY_SSOT_AUDIT.md)

---

## Executive summary

**Approval writes are correct.** If admin map shows an occupant, DB has `bookings.status = confirmed` and `bed_reservations.status = active` with today in `stay_range`.

**Root cause is read-path label split**, not missing DB updates or ISR cache (public pages are `force-dynamic`).

| Surface | Loader | Label function | Occupied finite stay |
|---------|--------|----------------|----------------------|
| Admin bed map | `getPgBedMap` + `occupancyReservationCoreSql` | `deriveBedAvailabilityView` | **Occupied · Until {checkout}** |
| Public PG | `getRoomDetail` (`customer.ts`) | `deriveCustomerBedAvailabilityView` | **Available soon · From {checkout}** |

Unit test `tests/unit/bedAvailabilityState.test.ts` currently **expects** this divergence for finite stays.

---

## Approval lifecycle trace

### Entry

```
approveQrPaymentAction          app/(admin)/admin/payments/actions.ts
  → reviewPaymentRecord         src/services/qrPayments.ts
    → recordPaymentSuccess      src/services/bookingLifecycle.ts
    → UPDATE pg_payment_records (separate statement)
  → revalidatePaymentReviewSurfaces (/pgs + admin paths)
```

### Pre-approval (resident submitted proof)

| Step | Function | Tables |
|------|----------|--------|
| Upload proof | `submitBookingPaymentRecord` | `INSERT pg_payment_records` (pending) |
| Extend hold | same | `UPDATE bed_reservations` (hold, extended expiry) |
| Await review | `markBookingAwaitingApproval` | `bookings → pending_approval` |

Public `isAvailableNow` blocks only `active` reservations, not `hold`.

### Phase 1 — `recordPaymentSuccess` transaction

| Op | Table | Change |
|----|-------|--------|
| Insert payment | `payments` | succeeded |
| Activate reservation | `bed_reservations` | hold → active |
| Confirm booking | `bookings` | pending_approval → confirmed |
| Audit | `audit_log` | payment_succeeded |

No `beds` row update — occupancy is reservation-backed.

### Phase 2 — Post-transaction (can compensate on failure)

Deposit ledger, rent invoice, billing profile, bed interest cleanup, membership, continuous residency, email, analytics.

### Phase 3 — Outside transaction

`pg_payment_records.status → approved` in `reviewPaymentRecord` after `recordPaymentSuccess` returns.

### Revalidation gaps

- Calls `revalidatePath('/pgs')` only
- Does **not** call `revalidateOccupancyViews(pgId)`
- Does **not** revalidate `/pgs/[slug]/rooms/[roomId]`
- `recordPaymentSuccess` never revalidates

---

## Where the chain stops

```
Approve → recordPaymentSuccess ✅ → getRoomDetail ✅ (isAvailableNow=false, nextAvailableDate=checkout)
  → deriveCustomerBedAvailabilityView ❌
       nextAvailableDate branch wins → "Available soon"
```

---

## Eight questions answered

1. **Tenancy?** No separate table — confirmed booking + active primary reservation.
2. **Booking active?** Yes — `confirmed`.
3. **Release reservation?** No — hold → **active** (occupy).
4. **Bed occupancy column?** No — via `bed_reservations` only.
5. **Invalidate cache?** Partial (`/pgs` only); not primary cause.
6. **Public stale data?** Unlikely — label misinterpretation.
7. **Admin different data?** Yes — different SQL + label priority.
8. **Wrong table?** **None** when admin shows occupied. Wrong **label output**.

---

## Proposed fix (not yet implemented)

### A. Label + query parity

- Add `isOccupiedToday` to public bed queries (`bedOccupiedTodayExistsSql`)
- `deriveCustomerBedAvailabilityView`: check `isOccupiedToday` before `nextAvailableDate` → Occupied
- Fix `canBookBed()` — don't allow book/hold on occupied beds via checkout date alone

### B. Atomic approval

- Wrap payment confirm + `pg_payment_records` approval in one transaction
- Call `revalidateOccupancyViews(pgId)` after approval

### C. Regression tests

`tests/integration/bookingApprovalOccupancyParity.test.ts` — after approve: admin map == public == resident == booking gate == KPI count.

---

## Files to change

| Fix | Files |
|-----|-------|
| Query + label | `customer.ts`, `bedAvailabilityState.ts`, `customerBedUi.tsx`, `customerBedTypes.ts` |
| Atomic approval | `qrPayments.ts`, `bookingLifecycle.ts`, `payments/actions.ts` |
| Tests | `bedAvailabilityState.test.ts`, new parity integration test |
