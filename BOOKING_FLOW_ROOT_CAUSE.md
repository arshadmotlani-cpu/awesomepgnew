# Booking Flow Root Cause Investigation

**Date:** 2026-06-25  
**Symptom:** After Booking Review → Continue, UI stuck on “Confirming your booking…” indefinitely. Sometimes redirects to payment or booking summary; sometimes freezes until unrelated navigation.

---

## Executive summary

The booking flow was **not a transaction**. It was a pile of React local state (`phase`), `useActionState` pending flags, `sessionStorage` resume tokens, and `router.refresh()` + `router.push()` — with **no terminal state on failure** and **no timeout**.

The infinite spinner is **not** caused by a slow API in the common case. It is caused by the client entering `submitting` and **never leaving it when the server action returns an error or when navigation races**.

---

## Root cause (primary)

### Stuck `phase === 'submitting'` on any server error

**File:** `src/components/customer/checkout/BookingReviewFlow.tsx` (pre-fix)

```ts
const busy = phase === 'submitting' || isPending;
```

On Continue (logged-in user):

1. `setPhase('submitting')` runs immediately.
2. Form submits via `useActionState(createBookingAction)`.
3. If the action returns `{ status: 'error', message }`, `isPending` becomes `false`.
4. **`phase` remains `'submitting'` forever** — nothing reset it on error.

The error message rendered in a rose box, but the primary button stayed disabled and labeled **“Confirming your booking…”** because `busy` stayed `true`.

**This is the direct cause of the reported infinite spinner.**

### Common error paths that triggered it

| Failure | Where | Why |
|--------|--------|-----|
| Phone mismatch | `createBookingAction` compared hidden form `phone` to `session.phone` | Hidden fields could be empty or stale after auth refresh |
| Gender / PG policy | Action or `createBooking` gender_policy | PG restricted; error returned but UI stuck |
| Date/pricing drift | Quote night count mismatch | Validation error |
| Profile incomplete | Missing email/name in DB | Error after OTP edge cases |

All of these returned **error** correctly from the server but the client **never transitioned out of submitting**.

---

## Root cause (secondary)

### `router.refresh()` before `router.push()` on success

**Files:** `BookingReviewFlow.tsx`, `BookingCartForm.tsx`

```ts
router.refresh();
router.push(state.redirectTo);
```

`refresh()` re-fetches the RSC tree (including `/booking/new` review page) **while** the client is mid-navigation. Effects:

- Component remount / state reset races
- User sees review page flash (“Booking Summary”) before or instead of payment
- “Clicking elsewhere changes screens” — layout invalidation from refresh

**Fix:** `router.replace(nextRoute)` only — server already knows the outcome.

---

## Root cause (tertiary)

### No timeout on client or server

If `createBooking()` or `quoteBookingPrice()` hung (DB lock, cold start), `isPending` stayed `true` with no ceiling.

**Fix:** 10s `withBookingActionTimeout` on server; matching client watchdog in `BookingReviewFlow`.

---

## Root cause (quaternary)

### Duplicate / fragile submit orchestration

Pre-fix flow used:

- `sessionStorage` key `apg-booking-review-continue`
- `resumeAfterAuthRef` on mount
- `requestSubmit()` in `useEffect` after `isLoggedIn`
- Manual `setPhase('submitting')` on button click

Multiple paths could fire `requestSubmit()` or leave resume flags set after a failed attempt — contributing to duplicate requests and unpredictable recovery.

---

## Why previous UX redesign caused regression

The P0 booking UX redesign (commits `cc3f8d8`, `e89f9e4`) correctly:

- Moved auth after review
- Removed calendar loading modals
- Introduced `BookingReviewFlow` with `useActionState`

But it **introduced a new client state variable `phase`** without pairing it to action outcomes:

- Success → relied on `useEffect` + navigation (race with `refresh`)
- Error → **no transition** (regression)
- Auth resume → `sessionStorage` + effects (fragile)

Earlier `BookingCartForm` had the same `refresh` + `push` pattern but visible form fields reduced silent validation failures.

---

## Affected files

| File | Role |
|------|------|
| `src/components/customer/checkout/BookingReviewFlow.tsx` | Broken state machine (primary) |
| `app/(customer)/booking/new/actions.ts` | Identity from hidden fields; no timeout; no structured success |
| `src/components/customer/BookingCartForm.tsx` | Same redirect race |
| `src/components/customer/checkout/BookingInlineAuth.tsx` | OTP → refresh → auto-submit race |

---

## Permanent solution (shipped)

### 1. Explicit booking flow state machine

`src/lib/booking/bookingFlowMachine.ts`

Steps: `REVIEW → AUTH_REQUIRED → CREATE_BOOKING → BOOKING_CREATED → REDIRECT_PAYMENT → FAILED`

- `bookingFlowReducer` — deterministic transitions
- `logBookingFlowStep()` — console + structured logs (`[booking-flow]`)
- `isBookingFlowBusy()` — busy **only** during `CREATE_BOOKING` while action pending

### 2. Server owns navigation target

`createBookingAction` success payload:

```ts
{
  status: 'success',
  bookingId: string,
  bookingCode: string,
  nextRoute: string,  // e.g. /booking/APG-…/pay
}
```

Client calls `router.replace(state.nextRoute)` — **never infers** the destination.

### 3. Identity from session customer record

Action uses `getCustomerById(session.customerId)` for name/email/phone/gender — **not** hidden form fields.

### 4. Timeouts

- Server: `withBookingActionTimeout()` wraps quote + create (10s)
- Client: watchdog clears busy state with user message

### 5. Submit guard

`submitGuardRef` prevents duplicate `requestSubmit()` while in flight.

---

## Production verification

1. Open browser DevTools → Console → filter `[booking-flow]`
2. Complete flow: bed → dates → review → continue
3. Expected log sequence (logged-in):

   ```
   REVIEW → CREATE_BOOKING → BOOKING_CREATED → REDIRECT_PAYMENT → (navigate to /pay)
   ```

4. **Error case:** Force PG gender mismatch or invalid dates → must see `FAILED` log + error text + enabled “Try again” (no infinite spinner)
5. **Timeout case:** If create exceeds 10s → “Something went wrong creating your booking. Please try again.”

---

## What we did NOT do

- No more loading-text patches without state transitions
- No `router.refresh()` before payment navigation
- No hidden-field identity validation for signed-in users

---

## Follow-ups (optional)

- Idempotency key on create to prevent duplicate bookings if client times out but server succeeds
- Server-sent events or polling for slow creates (if 10s proves tight in production)
- Remove legacy `BookingCartForm` path if unused in production funnel
