# Beds

> Domain hub — individual bed inventory units (the atomic occupancy slot).

Cross-links: [[START_HERE]] · [[Bed Assignment]] · [[DATABASE#Inventory & property]]

---

## Purpose

A **bed** is the smallest bookable inventory unit. Each bed belongs to a [[Rooms|room]], has a status (available / maintenance / blocked), pricing tiers (`bed_prices`), and reservation history via `bed_reservations`. Public booking and admin assignment both target beds.

**SSOT:** `beds` table, `bed_prices`, `bed_reservations`, `occupancySsot.ts`

> For assignment workflow and bed map UI, see [[Bed Assignment]].

---

## Related features

- [[Bed Assignment]] / bed map — `/admin/pgs/[pgId]/map`
- Public bed selection — `/pgs/[pgSlug]/rooms/[roomId]`
- Bed pricing — `/admin/pricing`
- GiST EXCLUDE overlap prevention on reservations
- SSOT alignment fix (`88a16e8`) — map vs residents list

See [[features#Bed Assignment / bed map]]

---

## Related workflows

| Workflow | Role |
|----------|------|
| [[WORKFLOWS#Resident Onboarding]] | Book specific bed |
| [[WORKFLOWS#Bed Assignment]] | Admin assign/move/remove tenant |
| [[WORKFLOWS#Vacating]] | Shorten reservation on approve |

---

## Related routes

| Route | Role |
|-------|------|
| `/admin/pgs/[pgId]/map` | Visual bed map |
| `/admin/pgs/[pgId]/rooms` | Bed list under rooms |
| `/admin/bookings/new` | Admin booking + assign |
| `/pgs/[pgSlug]/rooms/[roomId]` | Public picker |

See [[ROUTES#Inventory & Bed Assignment]]

---

## Related database entities

| Table | Role |
|-------|------|
| `beds` | `bed_code`, `status`, FK → `rooms` |
| `bed_prices` | daily / weekly / monthly / deposit rates |
| `bed_reservations` | `stay_range [check_in, check_out)`, kind, status |
| `bookings` | Linked via reservation |

**Constraint:** GiST EXCLUDE prevents overlapping active/hold reservations on same bed.

See [[DATABASE#Inventory & property]] · [[DATABASE#Bookings & occupancy]]

---

## Related decisions

- [[DECISIONS#Half-open stay ranges]]
- [[DECISIONS#Bed assignment SSOT alignment]]
- [[DECISIONS#Pricing snapshot immutability]]

---

## Related hubs

[[Rooms]] · [[Bed Assignment]] · [[Bookings]] · [[Residents]] · [[Vacating]] · [[Operations]]

See [[BUGS#BED-SSOT-01]] (resolved)
