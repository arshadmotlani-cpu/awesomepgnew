# P0-1 — Admin Resident Profile

**Route:** `/admin/residents/[customerId]`  
**File:** `app/(admin)/admin/residents/[customerId]/page.tsx`  
**Permission gate:** `bookings:write` (page load)

---

## Where you are (target copy)

> **{Resident name}** — {Living at PG · Room · Bed | No bed yet | Moved out}

---

## Action inventory (as-built pre-redesign)

### Header & navigation

| Action | Classification | Notes |
|--------|----------------|-------|
| PG bed map | Secondary | Only when active tenancy |
| Breadcrumb → Residents list | Secondary | |
| Breadcrumb → Overview | Secondary | |

### Alerts & success banners

| Action | Classification | Notes |
|--------|----------------|-------|
| Link → KYC queue | Primary (if unverified) | Blocks assignment |
| Link → Collections | Secondary | Legacy path |
| Rent updated banner + payment link | Secondary | Post-action feedback |
| Bed reassigned WhatsApp | Secondary | Post-action |
| Assignment saved banner | Secondary | |
| Tenant assigned WhatsApp | Secondary | |

### Financial Command Center

| Action | Classification | Notes |
|--------|----------------|-------|
| View deposit wallet summary | Secondary | Read-only |
| Generate rent invoice (category) | Advanced | Per-category |
| Generate deposit invoice | Advanced | |
| Generate electricity invoice | Advanced | |
| Generate PS4 / custom invoice | Advanced | |
| Per-line “Invoice” button | Advanced | |
| Per-line WhatsApp with link | Advanced | Duplicates action bar |
| 9 invoice presets | Advanced | Combined builder |
| Category checkboxes | Advanced | |
| Generate combined invoice | Advanced | |
| Payment link / WhatsApp after generate | Advanced | |
| Invoice history expand | Secondary | Read-only |

### Collection tools (below FCC)

| Action | Classification | Notes |
|--------|----------------|-------|
| Express collection (modal) | **Primary** | Record cash/UPI already received |
| Create charge generator form | Advanced | Creates new debt |

### Summary cards

| Action | Classification | Notes |
|--------|----------------|-------|
| Verify KYC → | **Primary** (if pending submission) | |
| View deposit amounts | Secondary | Read-only |

### Resident Action Bar

| Action | Classification | Notes |
|--------|----------------|-------|
| KYC Review link | Primary (if pending) | |
| KYC WhatsApp | Advanced | Duplicate of primary flow |
| Rent Edit → tenancy | Secondary | |
| Rent WhatsApp | **Primary** (if due) | |
| Deposit → deposit detail | **Primary** | |
| Deposit WhatsApp | Advanced | Covered by primary “Send payment request” |
| Electricity View/Create bill | Secondary | |
| Electricity amount edit + WhatsApp | Advanced | |
| History → booking | Secondary | |
| Invoices → registry | Secondary | |

### Stay section

| Action | Classification | Notes |
|--------|----------------|-------|
| Booking link | Secondary | |
| Rent & electricity link | Secondary | |
| Deposit ledger link | Secondary | |
| Bed map link | Secondary | |

### Tenancy

| Action | Classification | Notes |
|--------|----------------|-------|
| Reassign bed (form submit) | **Primary** | |
| Block whole room checkbox | Advanced | |
| Assign tenant form (no bed) | **Primary** | Unverified: blocked with message |

### Payment history table

| Action | Classification | Notes |
|--------|----------------|-------|
| (read-only) | Secondary | |

### Archive

| Action | Classification | Notes |
|--------|----------------|-------|
| Archive resident | Advanced | Destructive; signup-only |

### Vacated state (`FinalSettlementPanel`)

| Action | Classification | Notes |
|--------|----------------|-------|
| Open deposit detail | **Primary** | |
| Open checkout settlement | **Primary** | If linked |

---

## Redesign: visible primary actions (max 5)

### Active resident (has bed)

| Priority | Label (plain) | Behavior |
|----------|---------------|----------|
| 1 | Send payment request | WhatsApp with link for largest outstanding (rent → deposit → electricity) |
| 2 | Record payment received | Opens express collection modal |
| 3 | Review identity | If KYC pending; else “Open security deposit” |
| 4 | Open security deposit | Link to `/admin/deposits/[bookingId]` |
| 5 | Change bed or room | Scroll to `#edit-tenancy` |

If KYC not pending, slot 3 promotes “View booking” or “PG bed map”.

### No bed (verified)

| Priority | Label | Behavior |
|----------|-------|----------|
| 1 | Assign to a bed | Scroll to `#assign-bed` |
| 2 | Review identity | If KYC pending |
| 3–5 | As available | Booking list, KYC queue |

### Vacated

Handled by `FinalSettlementPanel` — primary actions on deposit/checkout links only.

---

## Advanced tools (collapsed)

- Full billing breakdown (formerly “Financial Command Center”)
- Per-category WhatsApp and invoice generator (`ResidentActionBar`)
- Create new charge (`CreateChargeGeneratorForm`)
- Archive signup-only account

---

## Jargon removed (surface copy)

| Before | After |
|--------|-------|
| Financial Command Center | Billing breakdown |
| SSOT · Required · Paid · Outstanding | Amounts from your records |
| Resident actions | (moved to Advanced) |
| Express collection | Record payment received |
| Verify KYC | Review identity documents |
| Deposit ledger | Security deposit |
| Reassign bed | Change bed or room |
| Tenant assigned | Bed assigned |
| Website signups | Not verified yet |

---

## Implementation checklist

- [x] Action audit documented
- [x] Primary / secondary / advanced classified
- [x] ≤5 primary actions component
- [x] Advanced tools collapsed
- [x] Plain-language copy on page header and sections
- [x] Stakeholder review before P0-2 (Deposit detail)
