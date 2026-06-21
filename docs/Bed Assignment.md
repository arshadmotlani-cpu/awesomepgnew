# Bed Assignment

> Domain hub — assign, move, and remove tenants on beds via bed map and admin tools.

Cross-links: [[START_HERE]] · [[Beds]] · [[WORKFLOWS#Bed Assignment]]

---

## Purpose

**Assign tenants to beds** and maintain occupancy truth across bed map, residents list, and operations queue. Uses `occupancySsot.ts` for consistent SQL predicates and GiST EXCLUDE for overlap prevention.

**SSOT:** `occupancySsot.ts`, `pgBedMap.ts`, `bedAssignmentCommand.ts`, `tenantAssignment.ts`, `revalidateOccupancyViews()`

> Physical bed entity: [[Beds]] · Room grouping: [[Rooms]]

---

## Related features

- Bed map — `/admin/pgs/[pgId]/map`
- Assign from [[Residents]] profile
- Admin booking — `/admin/bookings/new`
- Future assignment filter (monthly / open_ended modes)
- SSOT alignment (`88a16e8`)

See [[features#Bed Assignment / bed map]]

---

## Related workflows

[[WORKFLOWS#Bed Assignment]] — entry points → SSOT check → reservation → revalidate

---

## Related routes

| Route | Role |
|-------|------|
| `/admin/pgs/[pgId]/map` | Visual assign/move/remove |
| `/admin/residents/[customerId]` | Assign bed link |
| `/admin/bookings/new` | Admin-created stay |

See [[ROUTES#Inventory & Bed Assignment]]

---

## Related database entities

`beds`, `bed_reservations`, `bookings`, `rooms`, `pgs` — see [[DATABASE#Bookings & occupancy]]

---

## Related decisions

- [[DECISIONS#Bed assignment SSOT alignment]]
- [[DECISIONS#Half-open stay ranges]]

---

## Related hubs

[[Beds]] · [[Rooms]] · [[Residents]] · [[Bookings]] · [[KYC]] · [[Operations]]
