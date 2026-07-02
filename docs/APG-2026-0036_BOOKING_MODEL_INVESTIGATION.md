# APG-2026-0036 Booking Model Investigation — Dhruv

**Status:** Complete (production verified 2026-07-02)  
**Method:** Live production query via `/api/admin/checkout-investigation`  
**Snapshot:** `public/assets/checkout-investigation/investigation.json` (`generatedAt: 2026-07-02T09:59:04Z`)

---

## Executive verdict

| Question | Answer |
|----------|--------|
| Is **APG-2026-0036** monthly or fixed-duration? | **B — Fixed-duration** (`fixed_date_stay` / `fixed_stay`) |
| Why does Room 102 show checkout **1 Aug 2026** today? | That date belongs to the **successor monthly booking APG-2026-0040** on **B1**, not 0036 |
| Why ~₹8,000 charged vs ~₹9,000 monthly expectation? | **₹8,242** is **0040** (monthly). **0036** was **₹2,685** (7-night fixed stay). Shantinagar list rent is **₹4,121/mo**, not ₹6,000 |
| Root cause of “Available soon” on occupied bed? | **Read-path architecture** — public UI treats `upper(stay_range)` as pre-bookable date **without** branching on `stay_type` / `duration_mode` |

**Do not treat APG-2026-0036 and the current B1 / Aug-1 incident as the same booking.**

---

## Resident timeline (production)

| Booking | Status today | Type | Bed | Stay range | Checkout field |
|---------|--------------|------|-----|------------|----------------|
| APG-2026-0032 | completed | fixed_stay | 102 B3 | 20 Jun → 23 Jun | 2026-06-23 |
| **APG-2026-0036** | **completed** | **fixed_stay** | **102 B3** | **23 Jun → 30 Jun** | **2026-06-30** |
| **APG-2026-0040** | **confirmed / active** | **open_ended (monthly)** | **102 B1** | **1 Jul → 1 Aug** | **null** |

Continuous residency record (`residency.currentBookingCode`) = **APG-2026-0040**, `expectedMoveOut` = **2026-08-01**.

---

## APG-2026-0036 — full production profile

### Identity

| Field | Value |
|-------|-------|
| Booking ID | `61e6104a-8291-4971-99a7-90b013a2e3de` |
| Customer | Dhruv · `3cd0d0cb-5f4c-4fd9-ae8b-780664e61f1c` · `dhruvpaul001@gmail.com` |
| PG | SHANTINAGAR - AWESOME PG |
| Room / bed | **102 · B3** (not B1) |

### Booking type & pricing plan

| Field | DB value | Meaning |
|-------|----------|---------|
| `stay_type` | `fixed_date_stay` | Short / fixed check-in & check-out |
| `duration_mode` | `fixed_stay` | Internal pricing mode for finite stays |
| Pricing engine | `computeLowestFixedStayRent` | 7 nights → **1× weekly rate** |
| `discount_paise` | `0` | No coupon / discount |

Production E2E script `verify-apg-0036-production.ts` Q6 **passed**: Fixed-Date Stay everywhere for 0036.

### Stay range & checkout

| Field | Value |
|-------|-------|
| Check-in | 2026-06-23 |
| Check-out (`upper(stay_range)`) | 2026-06-30 |
| `expected_checkout_date` | 2026-06-30 |
| Nights | 7 |
| Reservation | was `active` → now `completed` |

### Rent charged (0036)

| Component | Paise | INR | Rule |
|-----------|-------|-----|------|
| Quoted subtotal (rent) | 190,000 | **₹1,900** | 1 week @ ₹1,900/wk (cheaper than 7×₹330/day) |
| Paid rent invoice | 190,000 | **₹1,900** | `rent_invoices` paid at checkout |
| Pricing strategy | `weekly_ceil` / single week | — | `fixedStayOptimizer` on bed rates |

Bed inventory at time (from ledger on prior stay): **₹330/day**, **₹1,900/week**, monthly reference **₹4,080**.

### Deposit charged (0036)

| Component | Paise | INR | Rule |
|-----------|-------|-----|------|
| Required deposit | 95,000 | **₹950** | **50% of rent subtotal** (`computeFixedStayDepositPaise`) |
| Deposit transfer credit (APG-0032) | 33,000 | ₹330 | Admin transfer from prior booking wallet |
| Deposit cash at checkout | 62,000 | **₹620** | QR payment allocation |
| Prior outstanding cleared | 16,500 | **₹165** | Owed on APG-0032 ledger |
| **Total held on 0036** | 95,000 | **₹950** | 330 + 620 (transfer + cash) |

### Total checkout payment (0036)

| Line | INR |
|------|-----|
| Rent | ₹1,900 |
| Deposit cash | ₹620 |
| Prior deposit due (0032) | ₹165 |
| Transfer credit (non-cash) | ₹330 |
| **Payment total** | **₹2,685** |

No coupons. No manual rent discount. Prior-booking deposit transfer is the only “adjustment.”

### Billing cycle & recurring billing

| Item | 0036 value |
|------|------------|
| `resident_billing_profiles` | Not created for fixed_stay at payment (`bookingLifecycle` only calls `ensureBillingProfileForBooking` for `monthly` / `open_ended`) |
| `auto_generate` | **false** (by design for fixed_stay) |
| Recurring rent invoices | **None** — single upfront rent invoice at checkout |
| Anniversary billing | **N/A** |

### Move-out & notice (0036)

| Item | Value |
|------|-------|
| Resident-submitted move-out | **None** |
| System vacating row | Auto-created **2026-06-30** — `fixed_stay` expiry cron |
| Notes | `"Auto-generated at fixed-stay checkout expiry (11 AM IST)."` |
| Notice period config | Settlement template has `notice_required_days: 14` |
| Notice deduction | **₹680 applied — BUG** (`diagnosis`: notice deduction on fixed_date_stay/fixed_stay) |
| `noticeDeductionAppliesToBooking()` | Should return **false** for fixed_stay |

Fixed stays **should** auto-complete at checkout; notice-period proration rules **do not apply**.

---

## Price validation — why not ₹6,000 + ₹3,000?

The **₹6,000 / ₹3,000 / ~₹9,000** benchmark does **not** match this booking or this PG.

### APG-2026-0036 (fixed 7 nights)

Expected under **fixed-duration rules**, not monthly:

- Rent ≈ cheapest fixed-stay combo → **₹1,900** ✓  
- Deposit ≈ 50% of rent → **₹950** ✓  
- Checkout total (before prior balance) ≈ **₹2,355**; actual cash collected **₹2,685** includes **₹165 prior** ✓  

### ~₹8,000 charge — actually APG-2026-0040

| Field | Value |
|-------|-------|
| Payment | **₹8,241.60** (`824,160` paise) on 2026-07-01 |
| Rent portion | **₹4,120.80** (`412,080` paise) |
| Deposit portion | **₹4,120.80** (`412,080` paise) |
| Type | `monthly_stay` / `open_ended` |

Shantinagar **bed_prices** for Room 102 beds (cert report 2026-07-01):

- `monthlyRatePaise`: **412,080** (₹4,121)  
- `monthlySecurityDepositPaise`: **412,080** (full month deposit — PG policy, not 50% half-month default)

So **₹8,242 ≈ ₹8,000** is the **monthly successor booking**, priced from **current Shantinagar inventory**, not from a ₹6,000/₹3,000 rule set.

---

## Why the public site shows checkout 1 August

Two separate mechanisms were conflated:

### 1. APG-2026-0036 (fixed, B3, ended 30 Jun)

- Checkout **2026-06-30** was a **real contractual end** for a fixed stay.  
- After expiry, bed B3 should become available (subject to settlement).  
- While **still checked in**, public UI wrongly showed **“Available soon · From {checkout}”** because `deriveCustomerBedAvailabilityView` prioritized `nextAvailableDate` over `isOccupiedToday`.

### 2. APG-2026-0040 (monthly, B1, active today)

- `expected_checkout_date` = **null** (correct for monthly).  
- But `stay_range` = **[2026-07-01, 2026-08-01)** — finite upper bound.  
- Public `getRoomDetail` sets `nextAvailableDate = upper(stay_range)` → **2026-08-01**.  
- For **monthly** stays this must **not** imply vacancy or pre-booking; resident continues until **move-out request**.

**Admin bed map** shows “Occupied · Until 1 Aug 2026” from `stay_upper`.  
**Public page** mislabels the same date as “Available soon”.

---

## Architectural bugs confirmed (no UI patch yet)

| # | Bug | Scope |
|---|-----|-------|
| 1 | **Single checkout-date semantics** — `upper(stay_range)` drives pre-bookable UI for both fixed and monthly | Public occupancy |
| 2 | **Monthly `stay_range` end** treated like fixed-stay vacancy date | Booking model + public read path |
| 3 | **Notice deduction on fixed_stay** — ₹680 on 0036 settlement | Checkout settlement |
| 4 | **Incident conflation** — docs referenced 0036 + B1; production is 0036=B3 (fixed, ended), 0040=B1 (monthly, active) | Ops / debugging |

---

## Proposed changes (after sign-off — not implemented)

### A. Occupancy SSOT (required before any UI patch)

1. `getBedOccupancySnapshot(bedId)` branches on `stay_type` / `duration_mode`:
   - **fixed_stay / daily / weekly:** occupied until `upper(stay_range)`; after checkout → available (or settlement hold).
   - **monthly / open_ended:** occupied while `confirmed` + active reservation + **no completed vacating**; `upper(stay_range)` is **billing placeholder only**, never public pre-book date.
2. Wire admin map + public `getRoomDetail` to same engine.
3. Regression: Dhruv/102-B1 monthly with Aug 1 range → **Occupied**, never “Available soon”.

### B. Booking / billing model

1. Stop writing misleading `upper(stay_range)` for open-ended monthly OR mark it `billing_period_end` distinct from `contractual_checkout`.
2. Ensure `ensureBillingProfileForBooking` + cron only auto-invoice monthly bookings.
3. Notice-period proration (1 Jul → 20 Jul example) only when `noticeDeductionAppliesToBooking` is true.

### C. Checkout settlement

1. Remove notice deduction from fixed-stay auto-expiry settlements (0036 class).
2. Re-open / repair archived 0036 settlement if ₹680 deduction affects refund.

### D. Under Maintenance

1. Add `maintenance` bed state to occupancy engine (admin + public).
2. Maintenance overrides availability regardless of reservations.

---

## Re-verify commands

```bash
node scripts/investigate-dhruv-arshad-prod.mjs
# → public/assets/checkout-investigation/investigation.json

VERIFY_APG_0036_E2E=1 npx tsx scripts/verify-apg-0036-production.ts  # historical 0036 checks
```
