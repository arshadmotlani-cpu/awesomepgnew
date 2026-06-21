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
