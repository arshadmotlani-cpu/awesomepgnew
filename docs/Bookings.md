# Bookings

> Domain hub — commercial stay contracts from discovery through completion.

Cross-links: [[START_HERE]] · [[WORKFLOWS#Resident Onboarding]] · [[Residents]]

---

## Purpose

A **booking** is the commercial contract linking a `customer` to a PG stay: duration mode, frozen `pricing_snapshot`, deposit requirements, and lifecycle status (draft → confirmed → completed / cancelled).

**SSOT:** `bookingLifecycle.ts`, `bookings` table

---

## Related features

- Public booking — `/booking/new`, `/booking/[bookingCode]/pay`
- Admin booking — `/admin/bookings/new`, `/admin/bookings/[bookingId]`
- Express / walk-in via [[Residents]]
- Duration modes: daily, weekly, monthly, open_ended, fixed_stay, reserve

See [[features#PG discovery & booking]] · [[features#Assign tenant / booking]]

---

## Related workflows

[[WORKFLOWS#Resident Onboarding]] steps 1–4

---

## Related routes

| Route | Role |
|-------|------|
| `/booking/new` | Public checkout |
| `/booking/[bookingCode]/pay` | Payment |
| `/admin/bookings/new` | Admin-created |
| `/admin/bookings/[bookingId]` | Detail |
| `/account/bookings` | Customer list |

See [[ROUTES#Booking]]

---

## Public browse listing

| Route | Component | Notes |
|-------|-----------|-------|
| `/pgs` | `PgBrowseList` → `SpatialPgGrid` | Normal CSS grid stack (2026-06-22 fix — no parallax overlap) |

---

## Bed booking wizard (2026-06-23)

`BedBookingPanel` is a 3-step flow after bed selection:

1. **Plan** — Monthly (default, `open_ended`), Weekly, or Daily (`fixed_stay` with +7/+1 nights). `shortStayOnly` hides monthly and defaults weekly.
2. **Dates** — `StayDateRangePicker` with live duration hint (e.g. `30 nights · ₹X/mo`).
3. **Review** — Summary + **Confirm booking** → `/booking/new?start=&end=&mode=&bed=`.

Optional `suggestedCheckIn` prefills rebooking extension check-in (prior checkout + 1 day). Validation (`validateAndContinue`) unchanged.

**Checkout totals (2026-06-23):** All booking screens use `computeNewBookingCheckoutTotals()` — rent + deposit due now − wallet credit + prior stay outstanding. Fixed-stay hybrid pricing shows week + remainder day lines via `BookingPriceBreakdown`. Prior balances snapshotted in `pricing_snapshot.priorOutstanding`.

See [[BUGS#BOOK-DATE-01]] for mobile Edit z-index fix.

---

## Related database entities

`bookings`, `bed_reservations`, `payments`, `pricing_snapshot` JSONB

See [[DATABASE#Bookings & occupancy]] · [[DECISIONS#Pricing snapshot immutability]]

---

## Related decisions

- [[DECISIONS#Pricing snapshot immutability]]
- [[DECISIONS#Half-open stay ranges]]

---

## Related hubs

[[Residents]] · [[Beds]] · [[Deposits]] · [[KYC]] · [[Vacating]] · [[Billing]]
