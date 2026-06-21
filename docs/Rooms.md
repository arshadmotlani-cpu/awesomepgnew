# Rooms

> Domain hub — room inventory within a PG property (capacity, type, beds).

Cross-links: [[START_HERE]] · [[features#PG / room / bed CRUD]] · [[DATABASE#Inventory & property]]

---

## Purpose

Define **room units** inside each PG: room number, type, capacity, and contained [[Beds]]. Rooms group beds for discovery (`/pgs/[pgSlug]/rooms/[roomId]`), electricity meter billing (room-level readings split among occupants), and bed map visualization.

**SSOT:** `rooms` table, PG admin CRUD under `/admin/pgs/[pgId]/rooms`

---

## Related features

- PG / room / bed CRUD — `/admin/pgs`, `/admin/pgs/[pgId]/rooms`
- Public room picker — `/pgs/[pgSlug]/rooms/[roomId]`
- [[Bed Assignment]] bed map (rooms as visual grouping)
- [[Electricity]] — meter readings at room level
- Pricing tiers via `bed_prices` on individual beds

See [[features#PG / room / bed CRUD]]

---

## Related workflows

| Workflow | Role |
|----------|------|
| [[WORKFLOWS#Resident Onboarding]] | Customer picks room/bed on public site |
| [[WORKFLOWS#Bed Assignment]] | Admin assigns bed within room |
| [[WORKFLOWS#Billing]] — Electricity | Room meter → split among occupants |

---

## Related routes

| Route | Role |
|-------|------|
| `/admin/pgs/[pgId]/rooms` | Room CRUD |
| `/admin/pgs/[pgId]/map` | Visual bed map by room |
| `/pgs/[pgSlug]/rooms/[roomId]` | Public bed picker |
| `/admin/pricing` | Rate management |

See [[ROUTES#Inventory & Bed Assignment]]

---

## Related database entities

| Table | Role |
|-------|------|
| `pgs` | Property |
| `floors` | Floor grouping |
| `rooms` | `room_number`, `room_type_id`, `capacity` |
| `beds` | Beds within room — see [[Beds]] |
| `room_types` | Shared / private / etc. |
| `electricity_bills` | Room-level meter readings |

See [[DATABASE#Inventory & property]]

---

## Related decisions

- [[DECISIONS#Half-open stay ranges]] — occupancy per bed, not room
- [[DECISIONS#Pricing snapshot immutability]] — rates at booking time

---

## Related hubs

[[Beds]] · [[Bed Assignment]] · [[Bookings]] · [[Electricity]] · [[Residents]]
