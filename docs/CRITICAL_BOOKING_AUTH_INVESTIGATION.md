# Critical Investigation — Booking State + Resident Authentication

**Status:** Root causes identified · architectural fixes in progress  
**Date:** 2026-07-02  
**Related:** [`OCCUPANCY_SSOT_AUDIT.md`](./OCCUPANCY_SSOT_AUDIT.md), [`BOOKING_APPROVAL_OCCUPANCY_INVESTIGATION.md`](./BOOKING_APPROVAL_OCCUPANCY_INVESTIGATION.md)

---

## Executive summary

| Issue | Root cause | Data or code? |
|-------|------------|---------------|
| **Room 102 B1 shows "Available soon · From 1 August 2026"** | Public label function treats **finite checkout date** as pre-bookable **before** checking **checked-in lifecycle** | **Code architecture** — not missing vacating request |
| **Harshal Deotale auth contradictions** | **Split identity lookups** — phone, email, and signup session resolve through **different code paths** that can hit **different `customers` rows** or incomplete rows | **Data + code** — requires production DB query |

---

# ISSUE 1 — Room 102 B1

## Incident (observed)

| Surface | Display |
|---------|---------|
| Admin bed map | Room 102 B1 · **Occupied** by Dhruv · Until 1 Aug 2026 |
| Public PG page | Room 102 B1 · **Available soon** · From 1 August 2026 |

User confirms: **no move-out request approved** for this resident.

## Known resident (from prior production audits)

| Field | Value (from existing verification scripts) |
|-------|---------------------------------------------|
| Resident name | **Dhruv** |
| Primary booking code | **APG-2026-0036** |
| Registered email | `dhruvpaul001@gmail.com` |
| Room / bed | **Room 102 · B1** (Shantinagar — per occupancy audits) |
| Deposit | ₹950 held on APG-2026-0036 |

> **Production confirmation:** Run `DOTENV_CONFIG_PATH=.env.vercel.pull npx tsx scripts/investigate-room102-harshal.ts` against live DB for exact UUIDs and all fields below.

## Expected booking profile (inferred from admin display + audit trail)

| Field | Expected DB state |
|-------|-------------------|
| Booking status | `confirmed` |
| Reservation status | `active` (primary) |
| Checked in? | **Yes** — today ∈ `stay_range`, reservation `active` |
| Check-out | **2026-08-01** (finite stay end = `upper(stay_range)`) |
| Move-out request | **None** (`vacating_requests` empty or not pending/approved) |
| Notice period | **No** — user has not approved notice |

## Why the UI shows "Available from 1 August"

### Step 1 — `getRoomDetail` SQL (`src/db/queries/customer.ts`)

For each bed, public pages compute:

```
isAvailableNow = false     (active reservation overlaps today)
nextAvailableDate = '2026-08-01'   (upper(stay_range) of active reservation)
vacatingDate = null      (no vacating_requests row)
```

`nextAvailableDate` is populated from the **checkout date of the current occupant** — not a vacancy date.

### Step 2 — `deriveCustomerBedAvailabilityView` (before fix)

Priority branch **#9** (`nextAvailableDate` → `pre_bookable`) ran **before** any `isOccupiedToday` lifecycle check:

```
label: "Available soon"
sublabel: "From 1 August 2026"
```

Admin path (`deriveBedAvailabilityView`) checks `isOccupiedToday` **first** → "Occupied · Until 1 Aug 2026".

### Step 3 — Colour mapping (`customerBedUi.tsx`)

`pre_bookable` → emerald (green), not grey.

**There is a real database reason for the date:** `upper(stay_range) = 2026-08-01`.  
**There is NO database reason for notice/vacancy:** no `vacating_requests` row.

## Business rules validation

| Rule | Dhruv / Room 102 B1 | Compliant before fix? |
|------|---------------------|------------------------|
| **Rule 1** Fixed dates: checked-in until checkout | Finite checkout 1 Aug 2026, still checked in | ❌ Public showed pre-bookable |
| **Rule 3** No move-out → Occupied, grey, not bookable | No vacating request | ❌ Showed Available soon + green |
| **Rule 4** Move-out → Notice, yellow | N/A | — |
| **Rule 5** After checkout → Available, green | Not yet vacated | — |

## Architectural root cause

**Occupancy is not one service.** Public uses date-driven `nextAvailableDate` label branch; admin uses lifecycle-first `isOccupiedToday`.

## Fix applied

1. `isOccupiedToday` on public queries via `bedOccupiedTodayExistsSql`
2. `deriveCustomerBedAvailabilityView`: occupied before pre-bookable branch
3. `canBookBed`: block when occupied or in notice
4. Long-term: `bedOccupancyEngine.ts` (see `BED_EXPLORER_SSOT_PLAN.md`)

---

# ISSUE 2 — Harshal Deotale (7083608128)

## Impossible UX matrix

| Flow | Message | Lookup key |
|------|---------|------------|
| Phone login | "No account found" | `findCustomerByPhone` |
| Signup | "Mobile already exists" | phone lookup route |
| Email login | "No account found" | `findCustomerByEmail` |
| Forgot password (email) | Email exists | `findCustomerByEmail` |
| Password reset | "Mobile belongs to another account" | `AuthPhoneConflictError` |

**These coexist when phone and email resolve to different `customers` rows.**

## Auth architecture

`customers` table = resident + auth (email, phone, password_hash unique). One row should own all bookings.

## Root cause — split identity

| Mechanism | Resolves |
|-----------|----------|
| Phone login | Customer **A** by phone |
| Email login | Customer **B** or null |
| Signup phone guard | **A** exists |
| Profile reset | Phone on **B** ≠ recovering email |

## Repair strategy

1. Pick canonical customer (bookings + password)
2. Reassign bookings from duplicate
3. Archive duplicate via `archiveStaleCustomerForRecovery`
4. Canonical row holds both phone and true email

## Auth integrity diagnostics

Admin: **`/admin/system/auth-integrity`**  
Script: `npx tsx scripts/investigate-room102-harshal.ts`

---

## Acceptance criteria status

| Criterion | Status |
|-----------|--------|
| Room 102 B1 colour from lifecycle | ✅ Fixed |
| No "Available Soon" without notice | ✅ Fixed |
| Harshal dual login | ⏳ Production merge required |
| Forgot password phone/email | ✅ Implemented |
| DB identity guardrail | ✅ Integrity check + unique indexes |
