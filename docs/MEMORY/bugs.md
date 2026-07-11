# Memory — Bugs

> **Append-only** problem and error log (operational memory).  
> Tracked issues with IDs and fixes: [[BUGS]] (formal bug registry).

**Rule:** Never delete entries. Link resolved items to [[BUGS#Resolved]] and [[mistakes]].

---

## 2026-07-11

- **OPS-BA-02** — Sidebar/Overview badges used `residentsPage.allQueueCount` while Operations page used unified queue; after Booking Approval cleared, badges stayed inflated. Fixed: `loadAdminNavBadges` reads `operationsTotalPendingCount` from unified queue only; revalidate `/admin` layout after booking mutations.
- **OPS-BA-01** — Booking Approval queue kept showing Reserved bed reserves after payment proof approval (injected via `listActiveBedReserves` into `booking_approval`); "View reservation" linked to public `/booking/:code` (404 for admin). Fixed: remove active-reserve injection; approval rows use `/admin/bookings/:id` only (`bookingApprovalQueue.ts`).

## 2026-06-23

- **NAV-SB-01** — Admin sidebar clicks ignored / required double-click → periodic `router.refresh()` in `AdminLiveRefreshProvider` raced Link navigation and re-suspended dynamic layout; removed 30s refresh, added optimistic active state + nav timing logs
- **VAC-B5-01** — Shanti Nagar 203-B5: `/admin/vacating` crash (ISO date + bigint RSC boundary); refund badge vs empty `/admin/requests` (checkout SSOT vs legacy table) → [[BUGS#VAC-B5-01]]

## 2026-06-22

- **VAC-CRASH-02** — Map + Date props crashed move-outs advanced tools → serialized via `toMoveOutAdvancedToolsRow` ([[BUGS#VAC-CRASH-02]])
- **VAC-DATE-01** — Vacating date picker crash on invalid input → `tryDiffDays` + form defaults ([[BUGS#VAC-DATE-01]])
- **EXP-INV-01** — Express walk-in invoice missing → `finalizeExpressWalkInFinancialInvoice` ([[BUGS#EXP-INV-01]])
- **SEARCH-01** — Partial resident search blocked at 3 chars → 2-char / 2-digit phone ([[BUGS#SEARCH-01]])

## Open

- **BOOK-MODEL-01** — Monthly `open_ended` bookings store finite `upper(stay_range)`; public occupancy treats it like fixed-stay checkout → "Available soon" on occupied B1 (APG-2026-0040) → `docs/APG-2026-0036_BOOKING_MODEL_INVESTIGATION.md`
- **CHECKOUT-NOTICE-01** — Notice deduction ₹680 applied to fixed_stay APG-2026-0036 auto-expiry settlement (production diagnosis 2026-07-02)
- **OPS-UX-01** — Duplicate vacating/deposit/refund CTAs across admin UI → use [[Operations]] only ([[BUGS#OPS-UX-01]])
- **OPS-UX-02** — Legacy route bookmarks still in use → see [[ROUTES#Legacy redirects]]
- **ELEC-DUE-01** — Approved electricity payments still in Electricity Due (Ishan ₹826, Anuj ₹827) → root cause: `approveElectricityPaymentProof` paid `amountPaise` only, leaving late-fee outstanding; duplicate June invoices per booking+month also possible → SSOT `electricityCollectibility.ts`, unified `listAdminElectricityInvoicesForReminders`, approval uses `projectElectricityInvoice().outstandingPaise`; prod verified Electricity Due (0) after late-fee cash settlement
- **VAC-SAME-01** — Same-day vacating approve + stay shortening edge case → see tests

---

## Resolved (memory log)

- **NAV-SB-01** (2026-06-23) — Admin sidebar unreliable navigation: removed 30s `router.refresh()` timer; `AdminNavLink` + optimistic active path + slow-nav console warnings >200ms

## 2026-06-21

- **VAC-CRASH-01** — `/admin/vacating` crash (Date serialization) → `d4c01c6` ([[mistakes]])
- **BED-SSOT-01** — Bed map vs residents list mismatch → `88a16e8`
- **VAC-RENT-01** — Missing checkout-month rent on notice → `369bddb`

---

## How to append

```markdown
## YYYY-MM-DD
- **BUG-ID or summary:** symptom → status (link [[BUGS#…]] if tracked)
```

---

## Related

[[mistakes]] · [[BUGS]] · [[tasks]] · [[active_memory]] · [[insights]]

<!-- INTEL_2026-06-21T19:59:31Z -->
### 2026-06-21T19:59:31Z

- **Types:**  · REFACTOR ·  · BUG ·  · TASK ·  · DECISION ·  · INSIGHT ·  · FEATURE · 
- **Primary:** BUG
- **Summary:** 4 files changed, 217 insertions(+), 104 deletions(-)
- **Files:**
- `.gitignore`
- `MEMORY/active_memory.md`
- `INTELLIGENCE.md`


<!-- INTEL_2026-06-21T19:59:45Z -->
### 2026-06-21T19:59:45Z

- **Types:**  · REFACTOR ·  · BUG ·  · DECISION ·  · INSIGHT ·  · TASK ·  · FEATURE · 
- **Primary:** BUG
- **Summary:** 11 files changed, 368 insertions(+), 104 deletions(-)
- **Files:**
- `.gitignore`
- `INTELLIGENCE.md`
- `MEMORY/active_memory.md`
- `MEMORY/bugs.md`
- `MEMORY/changelog.md`
- `MEMORY/decisions.md`
- `MEMORY/ideas.md`
- `MEMORY/insights.md`
- `MEMORY/tasks.md`


<!-- INTEL_2026-06-21T20:03:44Z -->
### 2026-06-21T20:03:44Z

- **Types:**  · REFACTOR ·  · BUG ·  · TASK ·  · DECISION ·  · INSIGHT ·  · FEATURE · 
- **Primary:** BUG
- **Summary:** 6 files changed, 360 insertions(+), 59 deletions(-)
- **Files:**
- `.gitignore`
- `INTELLIGENCE.md`
- `MEMORY/active_memory.md`


<!-- INTEL_2026-06-21T20:59:03Z -->
### 2026-06-21T20:59:03Z

- **Types:**  · REFACTOR ·  · BUG ·  · FEATURE ·  · TASK ·  · DECISION ·  · INSIGHT · 
- **Primary:** BUG
- **Summary:** 8 files changed, 328 insertions(+), 6 deletions(-)
- **Files:**
- `AI_SYSTEM_PROMPT.md`
- `BUGS.md`
- `Billing.md`
- `CHANGELOG.md`
- `Checkout Settlements.md`
- `MEMORY/bugs.md`
- `MEMORY/changelog.md`
- `Vacating.md`

