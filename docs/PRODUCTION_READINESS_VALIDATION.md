# Production Readiness Validation — Phases 1, 2, 2B, 3

**Date:** 2026-07-02  
**Validator:** Automated audit + 871 unit/integration tests  
**Live DB:** Not available in CI sandbox (`DATABASE_URL` missing)

---

## 1. Data safety — migration 0094

| Concern | Verdict | Notes |
|---------|---------|-------|
| Booking history | ✅ Safe | No `DELETE`; no status changes on `bookings` |
| Payment history | ✅ Safe | No payment / ledger tables touched |
| Invoices | ✅ Safe | No invoice tables touched |
| Settlements | ✅ Safe | No checkout_settlement tables touched |
| Resident history | ✅ Safe | No customer row deletes |
| Truncates stay ranges | ✅ Safe | **Widens** upper bound to `NULL` only for active/hold monthly where upper ≥ 2090; **lower bound preserved** |
| Reversible rollback | ⚠️ Partial | See rollback strategy below |

**What 0094 does:**
- `ADD COLUMN` only (PG policy, room policy nullable, `billing_anchor_date`)
- `UPDATE` PG seed values (Shanti Nagar / IT Park)
- `UPDATE bed_reservations` — sentinel upper → `NULL` (active monthly only)
- `UPDATE bookings` — set `billing_anchor_date`, clear `expected_checkout_date` on monthly

**What it does NOT do:** No drops, no truncates, no cascade deletes.

---

## 2. Production compatibility audit

### 2099 / finite monthly **writers** (fixed during validation)

| File | Was | Now |
|------|-----|-----|
| `residentAdmin.ts` | Wrote `2099` on bed move / shift-to-reservation | Unbounded `daterange(..., NULL)` |
| `occupancyAdmin.ts` | Placeholder bookings through 2099 | Unbounded + `billing_anchor_date` |
| `room-change-actions.ts` | Availability probe to 2099 | `endDate: null` |

### Intentional **readers** (legacy row compatibility — not new behaviour)

| Location | Purpose |
|----------|---------|
| `lib/dates.ts` — `isOpenEndedStayEnd`, `OPEN_ENDED_STAY_END` | Treat pre-migration sentinel as unbounded when **reading** |
| `bedOccupancyEngine.ts` | Skip sentinel when resolving contractual checkout |
| `bedOccupancyBatch.ts`, `customer.ts` SQL | `upper < 2090` filter for `nextAvailableDate` display |
| `AdminVacatingSubmitForm`, `VacatingRequestForm` | Ignore sentinel checkout on forms |
| `migration 0094`, `repair-monthly-stay-ranges.ts` | Identify rows to repair |

### Old occupancy engine

| Check | Result |
|-------|--------|
| `OCCUPANCY_ENGINE_V2` flag | **Removed** — engine always on |
| `bedOccupancyEngineFlag.ts` | **Deleted** |
| Legacy occupancy math in UI | **None** — all surfaces via `bedOccupancyResolve` / batch |

### Old reserve logic

| Check | Result |
|-------|--------|
| 50% of monthly rent for reserve | **Removed** — uses optimized fixed-stay rent |
| Expire past check-in | **Replaced** — `processDueBedReserveConversions` |
| Labels "Held" / short-stay sublabel | **Replaced** — "Reserved until {date}" |

### Old deposit calculation

| Location | Result |
|----------|--------|
| `pricing.ts` / `createBooking` | ✅ PG → room → bed via `resolveMonthlyDepositPaise` |
| `roomShiftQuote.ts` | ✅ Fixed — uses `pricing.computeMonthlyDepositPaise` |
| `customerDepositDisplay.ts` | ✅ Fixed — one-month default via `monthlyDepositPolicy` |
| `lib/pricing/depositRules.ts` | Retained for **fixed-stay 50%** only; monthly half-month path unused in production quotes |

---

## 3. Regression journeys (code + test evidence)

### A — Fixed stay

| Step | Evidence |
|------|----------|
| Book | `createBooking` fixed_stay + `validateFixedDateStay` (29-night cap) |
| Check in | `stay_range` `[check-in, check-out)` |
| Stay | Occupancy engine `occupied` |
| Checkout | `fixedStayAutoExpiry` → settlement, **checkout_pending** (no early release) |
| Settlement | `checkoutSettlement` workflow |
| Available | `bookableFromDate` = checkout + 1-day buffer |

Tests: `fixedStayAutoExpiry`, `bedOccupancyEngine.test.ts` (checkout_pending), `stayType.test.ts`

### B — Monthly stay

| Step | Evidence |
|------|----------|
| Book | `createBooking` open_ended, unbounded `stay_range`, `billing_anchor_date` |
| Recurring invoices | `billingScheduler` (excludes maintenance beds) |
| Notice / vacating | `vacating.ts` drives `bookableFromDate` |
| Settlement | Monthly checkout_pending mandatory |
| Available | Vacating date + turnover buffer |

Tests: `pricing.test.ts`, `vacatingPastDue.test.ts`, `depositSsot.test.ts`

### C — Reservation

| Step | Evidence |
|------|----------|
| Reserve | `quoteBedReserve` optimized rent × 50%, no deposit |
| Temp booking before reserve | `validateShortStayDuringReserve` |
| Buffer day | `reserveBufferDate` (check-in − 1) |
| Auto-convert | `convertBedReserveToMonthlyStay` on cron |
| Deposit + billing | Quote at conversion; `pending_payment` if due |

Tests: `bedReservePolicy.test.ts`, `bedOccupancyEngine.test.ts`

### D — Maintenance

| Step | Evidence |
|------|----------|
| Mark maintenance | Admin bed status toggle |
| No book/reserve/bill | `isBedAvailable`, `canOfferBedReserve`, billingScheduler |
| Restore | Status → available |

Tests: engine maintenance branch; KPI exclusion in `aggregateOccupancyCounts`

### E — Checkout pending

| Step | Evidence |
|------|----------|
| Settlement pending | `isCheckoutPending` → not bookable |
| Settlement complete | Settlement terminal states |
| 1-day buffer | `TURNOVER_BUFFER_DAYS` in engine |

Tests: `bedOccupancyEngine.test.ts`, `criticalJourneys.test.ts`

---

## 4. Admin surfaces

All occupancy counts/labels route through `bedOccupancyBatch` → `resolveBedOccupancy` → engine:

- Browse / PG cards — `customer.ts` `listPublicPgs`
- Room / bed maps — `pgBedMap.ts`, `getRoomDetail`
- Dashboards — `getDashboardStats`, `getOccupancyByPg`
- Express Sale — `expressBookingSale` (no 2099)
- Tenant assignment — `tenantAssignment` (unbounded)
- Occupancy % — maintenance excluded from denominator

---

## 5. Public surfaces

- Browse / room / bed — engine labels consistent
- Maintenance — **Under Maintenance**
- Reservation — **Reserved until {date}**
- Notice — `notice_period` / vacating copy
- Available from — `resolveBookableFromDate` (vacating > checkout settlement)

---

## 6. Remaining risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Migration 0094 not reversible for sentinel uppers | Medium | Backup before deploy; repair script is idempotent |
| No live DB smoke in this environment | Medium | Run repair dry-run + Room 102 script on staging |
| `customerDepositDisplay` client fallback lacks PG context | Low | Server always sends `quotedMonthlyDepositPaise` on bookable beds |
| Completed historical rows may still have 2099 upper until backfill | Low | Readers treat as unbounded; repair script handles active |
| Reserve auto-convert sets `pending_payment` — customer must pay | Low | By design per plan §8.2 |

## Breaking changes

- Monthly deposit at IT Park / Central Avenue: **two months** (was half-month fallback for unset bed deposit)
- Fixed stays max **29 nights** (was 30)
- `expected_checkout_date` cleared on active monthly bookings (display uses vacating / open-ended)
- Fixed-stay auto-expiry no longer immediately completes booking — **checkout_pending** until settlement

## Migration risks

- Low row count updates only; no table rewrites
- GiST indexes on `stay_range` unchanged
- Run during low traffic; no app downtime required if code deploys with migration

## Rollback strategy

1. **App rollback:** Revert to previous commit (old code reads 2099 via `isOpenEndedStayEnd`)
2. **DB rollback (partial):**
   - `DROP COLUMN billing_anchor_date`, `monthly_deposit_policy` on pgs/rooms — safe
   - **Cannot** restore original 2099 uppers without pre-migration backup
   - `expected_checkout_date` on monthly — lost if cleared (was sentinel anyway)

## Production deployment order

1. **Backup** database (pg_dump)
2. Deploy application code (this commit)
3. Run `npm run db:migrate` (0094)
4. Run `npx tsx scripts/repair-monthly-stay-ranges.ts --dry-run` then apply
5. Smoke: Room 102 B1, one fixed booking, one monthly quote per PG
6. Verify cron: bed-reserve conversion, billing scheduler

## Estimated downtime

**Zero** — rolling deploy; migration is online DDL + targeted UPDATEs.

## Manual data repair

- `scripts/repair-monthly-stay-ranges.ts` for any active monthly missed by migration filter
- No payment/invoice repair expected

---

## Validation outcome

✅ **PASS** — automated suite green; legacy writers eliminated; intentional legacy readers documented.

Live DB verification deferred to staging with `DATABASE_URL`.
