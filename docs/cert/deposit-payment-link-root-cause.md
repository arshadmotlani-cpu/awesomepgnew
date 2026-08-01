# Deposit payment link root cause — Govind kumar (APG-2026-0082)

**Date:** 2026-08-01  
**Cert result after repair:** **12/12 CERTIFIED**

---

## Summary

Govind's portal Total Due showed **₹216** instead of **₹2,278** because his active deposit payment link had `booking_id = NULL`. The resident portal only includes deposit in Total Due when `payment_links.booking_id` matches the resident's booking.

This was caused by a **current code bug** in `ensureDepositDuePaymentLink`, not a migration or one-off legacy record.

---

## Root cause analysis

### 1. Which code path created this payment link?

**Primary path:** `applyPartialDepositOnConfirm` → `ensureDepositDuePaymentLink` → `createPaymentLink`

Triggered when admin approves a partial deposit (Govind paid ₹2,059 of ₹4,121 required; ₹2,062 remained due).

**Amplification path:** Each subsequent call to `ensureDepositDuePaymentLink` (from resident portal load via `ResidentAreaSection` / `loadResidentAccountContext`, pricing propagation, or the initial cert script before it was made read-only) called `createPaymentLink` directly, inserting **a new active link every time** without expiring prior ones.

Govind accumulated **92 active duplicate deposit links** (all `booking_id = NULL`).

Admin paths that **did** pass `bookingId` correctly:
- `getOrCreatePaymentLink` via `paymentActions.ts` and `operations/actions.ts`
- `createResidentCharge` for `additional_deposit`

### 2. Why was `booking_id` not populated?

`ensureDepositDuePaymentLink` called `createPaymentLink` **without** the `bookingId` field:

```typescript
// BEFORE (bug)
await createPaymentLink({
  residentId: ctx.customerId,
  // ... other fields ...
  purpose: 'deposit',
  // bookingId missing!
});
```

`payment_links.booking_id` was added in migration `0051_resident_charge_generator.sql` (2025). The deposit-due auto-link path was never updated to populate it.

`getOrCreatePaymentLink` already had backfill logic for reused links, but `ensureDepositDuePaymentLink` bypassed it entirely.

### 3. Is this possible for any other resident?

**Yes — any resident** whose deposit link was created via `ensureDepositDuePaymentLink` (partial deposit approval, portal auto-ensure, pricing propagation).

**Production audit (2026-08-01):**

| Metric | Count |
|--------|------:|
| Total deposit links | 95 |
| Active deposit links | 95 |
| `booking_id IS NULL` | 93 |
| Invalid booking references | 0 |
| Duplicate active links (same resident) | 1 (Govind — 92 links) |
| Duplicate active links (same booking) | 0 |
| Confirmed booking with deposit due + mismatched link | 1 (Govind only) |

Only **Govind** had an active deposit due **and** a mismatched link at certification time. Other NULL-booking links are stale (vacated residents, test data, fully paid deposits) but should be cleaned up separately.

### 4. Legacy migration, legacy flow, or current bug?

| Category | Verdict |
|----------|---------|
| Old migration | `booking_id` column added correctly in 0051 |
| Legacy data | Some early links pre-date booking scoping |
| **Current bug** | **`ensureDepositDuePaymentLink` omits `bookingId` and uses `createPaymentLink` instead of `getOrCreatePaymentLink`** |

---

## Production records repaired

| Action | Detail |
|--------|--------|
| Kept link | `8078f2b2-f603-460f-ba75-cfeb01fd3224` (latest active, ₹2,062) |
| Set `booking_id` | `43a5ce09-ddc3-4ddc-a7b9-f55db6d585e4` (APG-2026-0082) |
| Expired duplicates | 91 other active deposit links for Govind |
| Audit log | `deposit_link_booking_repair` on kept link |

Script: `scripts/repair-govind-deposit-payment-link.ts`

---

## Code fix

**File:** `src/services/depositCollection.ts`

1. Switch `ensureDepositDuePaymentLink` to `getOrCreatePaymentLink` with `bookingId`
2. Add `expireSupersededActiveDepositLinks` — expires other active deposit links for the same resident after ensure/create (one canonical link per booking flow)

---

## Regression test

**File:** `tests/unit/depositDuePaymentLink.test.ts`

- Asserts `ensureDepositDuePaymentLink` passes `bookingId` to `getOrCreatePaymentLink`
- Asserts it no longer calls `createPaymentLink` directly
- Asserts superseded-link expiry helper exists
- Asserts `getOrCreatePaymentLink` backfills `booking_id` on reused deposit links

---

## Why this cannot happen again

1. **Every new deposit-due link** is created with `bookingId` scoped to the booking
2. **Duplicate active links** are expired immediately after ensure/create
3. **Portal cert gate** (`npm run cert:shantinagar-phase1`) checks `deposit_due_pay_link` and `total_due` for every active Shantinagar resident — any ₹1 drift blocks release
4. **Regression test** fails CI if `bookingId` is dropped from the ensure path again

---

## Certification

```bash
npm run cert:shantinagar-phase1
# Result: CERTIFIED — 12/12 passed (2026-08-01T11:40:43Z)
```

Report: `docs/cert/shantinagar-phase1-latest.json`
