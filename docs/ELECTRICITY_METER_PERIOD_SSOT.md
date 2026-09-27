# Electricity meter-period SSOT (forensic + design)

## Production schema (`electricity_bills`)

| Field | Present | Role today |
|--------|---------|------------|
| `previous_reading_units` | Yes | Opening meter snapshot (units) |
| `current_reading_units` | Yes | Closing meter snapshot (units) |
| `units_consumed` | Yes | Derived delta |
| `billing_month` | Yes | **Reporting label** (1st of month); was treated as consumption identity |
| `created_at` | Yes | Bill generation timestamp |
| `start_meter_log_id` / `end_meter_log_id` | Yes (optional FK) | Links to `meter_logs` when populated |
| `period_start_date` / `period_end_date` | **Added in migration 0152** | Authoritative consumption interval dates |
| `bill_status` | Yes | Finalization state |
| `calculation_breakdown` | Yes | JSON audit |

`meter_logs`: `units`, `recorded_at` (date), `reading_type` (`monthly` \| `checkout` \| `checkin`).

**Before this change:** unique index `(room_id, billing_month)` prevented two bills in the same calendar month even when meter intervals differed.

## Where calendar-month assumptions lived

| Area | Assumption |
|------|------------|
| `consumptionMonthContinuity.ts` | Required a finalized bill for the **previous calendar month** |
| `roomMeterReadingSsot.ts` (service) | Baseline from bills with `billing_month < target` |
| `createElectricityBill` | Occupancy clipped to `monthBounds(billing_month)`; blocked on missing month |
| `electricityPriorCollection` / verified prior | Keyed `roomId + billingMonth` |
| `checkoutElectricityOperatorAudit` | Loaded bill by `room + billing_month`; invoices by invoice `billing_month` |
| `electricity_invoices` | `(room_id, billing_month, customer_id)` uniqueness — invoices still labeled by month but tied to `electricity_bill_id` |

## Generic fix (no production data writes)

1. **Identity:** unique `(room_id, previous_reading_units, current_reading_units)`; optional period dates on bill row.
2. **Chain:** opening reading = last finalized **closing** by applied order (`created_at`), not calendar month.
3. **Generation:** no “missing August” block when Jul→Sep meter chain is continuous.
4. **Occupancy:** allocation window uses meter period dates when provided (else legacy month window until backfill).
5. **Checkout:** pick finalized bill with greatest `closing ≤ checkout reading`; tail = `closing→checkout`; invoices loaded by `electricity_bill_id`.
6. **Collections:** remain on invoice rows linked to the bill that owns the meter interval.

## Room 102 timeline (production semantics)

Labels like “Jun/Jul/Sep” are **reporting months**, not consumption boundaries.

| Meter period | Opening date* | Opening | Closing date* | Closing | Units | Gross @ ₹16 | Generated | Finalized |
|--------------|---------------|---------|---------------|---------|-------|-------------|-----------|-----------|
| 1 | (Jun bill) | 205 | (Jun bill) | 241 | 36 | ₹576 | Jun 2026 | Yes |
| 2 | (Jul bill) | 241 | (Jul bill) | 337 | 96 | ₹1,536 | Jul 2026 | Yes |
| 3 | 337→424 interval† | 337 | Sep 4, 2026† | 424 | 87 | ₹1,392 | **2026-09-04** | Yes (unchanged) |
| 4 (checkout tail) | Sep 5‡ | 424 | checkout | 479 | 55 | ₹880 | checkout | Not a monthly bill |

\*Historical rows may only have `billing_month` until period dates are backfilled on new bills.  
†Cross-month consumption (late July through Sep 4) — one interval, not “September-only.”  
‡Tail starts day after finalized closing date.

**Two bills in September (after fix):**  
- Bill A `337→424` keeps its invoices/collections on bill id A.  
- Bill B `424→479` (if generated as a monthly bill) gets its own row and invoices; checkout tail uses `424→479` without rebilling `337→424`.

Run read-only timeline: `USE_PRODUCTION_DB=1 npx tsx scripts/audit-room-102-meter-period-timeline-readonly.ts`
