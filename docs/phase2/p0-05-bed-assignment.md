# P0-5 — Bed Assignment (Admin)

**Routes:** `/admin/pgs/[pgId]/map`, `/admin/bookings/new`  
**Status:** ✅ Presentation redesign complete

---

## Structure

### Bed map

| Section | Contents |
|---------|----------|
| Bed map summary | Total · Occupied · Open now · Moving out soon (4 stats, was 6) |
| Bed grid | Unchanged interaction |
| Side panel — occupied | Resident card · What to do next (≤5) · Advanced tools (collapsed) |
| Side panel — empty | Help text · What to do next · Advanced tools |

### Assign to bed (`/admin/bookings/new`)

Plain-language header and dark-theme empty state (form unchanged).

---

## Before / after action count

| Surface | Before | After |
|---------|--------|-------|
| Summary strip | 6 stat cards | **4 stat cards** |
| Occupied bed panel | 4 nav links + remove + vacating block + move + reserve (~10+) | **≤5 primary links** + Advanced (collapsed) |
| Empty bed panel | 2 toggles + 2 links visible | **3 primary links** + Advanced (collapsed) |
| Vacating on bed map | 3–4 buttons visible | Approve in primary OR all in Advanced |

---

## Duplicates removed

- Removed duplicate status badge block (availability now in header line)
- Removed separate 4-link nav when primary actions cover same destinations
- Consolidated vacating + move + remove + manual toggles into Advanced tools

---

## Advanced tools moved

- Change bed (`BedMapMoveForm`)
- Shift to reservation
- Remove tenant
- Start move-out form
- Reject / complete / undo / cancel vacating
- Manual reserved / occupied toggles

---

## Business logic unchanged

- `getPgBedMap`, all bed map server actions
- `AssignTenantForm`, `listAssignableBeds`
- Permissions (`pgs:write`, `bookings:write`)
