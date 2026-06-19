# P1-5 — Application Dashboard

**Routes:** `/account/bookings`, `/account/profile` (pre-resident), `/booking/[bookingCode]`  
**Status:** ✅ Presentation redesign complete

---

## Structure

### Bookings list (`/account/bookings`)

| Section | Contents |
|---------|----------|
| What to do next | Open latest booking · Resident home |
| Booking list | Plain status badges · simplified copy |

### Application progress (`/account/profile` — pre-resident)

| Section | Contents |
|---------|----------|
| Your move-in journey | Completed count · identity · deposit |
| What to do next | One primary CTA based on stage |
| Step by step | 6-stage timeline (plain labels) |

### Booking detail (`/booking/[bookingCode]`)

| Section | Contents |
|---------|----------|
| Status banner | Unchanged workflow states |
| What to do next | Pay · Identity · Resident home (≤5) |
| Booking summary | Former “at a glance” block |

---

## Before / after

| Surface | Before | After |
|---------|--------|-------|
| Application tracker | “Application progress” jargon | **Your move-in journey** + next step |
| Bookings list | Code list only | **What to do next** + list |
| Booking detail | Pay in banner + scattered links | **One primary actions section** |
| Stage labels | KYC submitted | Identity uploaded |

---

## Plain language

| Before | After |
|--------|-------|
| KYC | Identity check |
| Application progress | Your move-in journey |
| Pending payment | Plain status badge |
| Booking at a glance | Booking summary |
| Resident Hub unlocked | Resident home unlocked |

---

## Business logic unchanged

- Booking status machine · pay routes · KYC banner · cancel form
- `ApplicationStatusTracker` stage index logic
