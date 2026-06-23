# Operations consolidation audit (H1–H8)

Audit of operational workflows after H1–H8. Goal: one discover path, one execute path, one verify path per task — no duplicate queues, stats, or navigation.

**Scope:** Remove duplication only. No visual redesign, new cards, or new dashboards.

---

## Summary

| Workflow | Discover (canonical) | Execute (canonical) | Verify (canonical) |
|----------|----------------------|---------------------|-------------------|
| Payment reviews | Ops home command center card, Revenue outstanding alert | `/admin/operations/payment-reviews` | Invoice/ledger status after approve |
| Billing queue | `/admin/revenue/billing` | Same page + resident profile `#open-bills` | Invoice status, SSOT engine |
| Resident 360 | `/admin/residents/[id]` | 360 bar + inline open bills | Financial summary, profile state |
| Operations home | `/admin/operations/residents` | Hero + filtered queue | Queue count drops, activity feed |
| Move-out pipeline | Ops queue + `/admin/vacating` | Vacating + checkout settlements | Pipeline status, settlement row |
| Bed assignment | `/admin/beds` (+ ops queue) | Bed command center `?customerId=` | Map/profile bed badge |
| Deposit timeline | `/admin/deposits/[bookingId]` | Workflow header → existing forms | Deposit summary card |
| KYC workspace | Ops queue + `/admin/residents/kyc` | `/admin/residents/kyc/[id]` | Profile KYC badge |

---

## 1. Payment reviews

**Discover:** Operations command center “Payment proofs awaiting review” card; Revenue outstanding approvals alert.

**Execute:** `/admin/operations/payment-reviews` — approve/reject with partial/overpayment support.

**Verify:** Invoice marked paid; resident financial summary updates.

### Current click paths (duplicates)

| Path | Clicks (approx.) |
|------|------------------|
| Revenue billing → “Payment reviews (Operations)” | 3 |
| PG collections → inline Approve on rent/electricity/QR proof | 4–5 |
| Ops action queue → one row per proof → Payment Reviews | 4 |
| Ops queue row “More” → Payment reviews | 5 |
| Resident profile → Primary actions → WhatsApp / record (parallel collection, not proof review) | 3–4 |

### Recommended single path

**Discover:** Ops home command center card (count) or Revenue alert.  
**Execute:** `/admin/operations/payment-reviews` only.  
**Verify:** Same screen after approve (status badge) or resident profile financial summary.

| Metric | Before | After |
|--------|--------|-------|
| Proof approval entry points | 4+ | 1 |
| Clicks to approve one proof from PG page | ~5 | ~3 (link → review → approve) |
| Clicks from ops home | ~4 (filter queue → row) | ~2 (card → approve) |

### Changes applied

- Removed inline proof approval from `PgCollectionsPanel` → link to Payment Reviews.
- Removed “Payment reviews (Operations)” from Revenue billing primary actions.
- Removed per-proof rows from operations action queue (count remains on command center card).
- Command center payment-proof card links directly to Payment Reviews (not queue filter).
- Removed generic “Payment reviews” from queue row More menu.
- Removed duplicate billing actions on resident profile (`ResidentProfilePrimaryActions`, `ResidentActionBar` in advanced tools when inline bills shown).

---

## 2. Billing queue / collections

**Discover:** `/admin/revenue/billing` (month tabs, needs-bill count).

**Execute:** Billing page tabs + resident profile `#open-bills` (WhatsApp, record payment per bill).

**Verify:** Invoice list status; resident financial summary.

### Current click paths (duplicates)

| Path | Clicks |
|------|--------|
| Revenue billing → rent/electricity tabs | 2–3 |
| Resident profile → Primary actions → Send payment / Record | 2–3 |
| Resident profile → Inline open bills | 1 (same page) |
| Resident profile → Advanced → Billing by category (`ResidentActionBar`) | 3–4 |
| Ops queue → rent overdue → resident profile (no direct bill) | 3–4 |

### Recommended single path

**Discover:** Revenue billing for bulk; ops queue or profile for resident-specific.  
**Execute:** Resident profile `#open-bills` for per-resident collection; Revenue billing for generation and bulk send.  
**Verify:** Invoice status on billing page or profile financial summary.

| Metric | Before | After |
|--------|--------|-------|
| Collection action strips on profile | 3 (360 bar, primary actions, action bar) | 2 (360 bar, inline bills) |
| Clicks to send rent reminder from profile | ~2–3 (which strip?) | ~2 (360 → open bills → WhatsApp) |

### Changes applied

- Removed `ResidentProfilePrimaryActions` and advanced-tools `ResidentActionBar` when inline open bills are shown.
- Removed duplicate stat grid on profile (bed/contact/identity/deposit — covered by 360 bar + stay details).

---

## 3. Resident 360

**Discover:** Residents list → profile; ops queue → resident link.

**Execute:** `Resident360WorkflowBar` primary action + `ResidentInlineOpenBills`.

**Verify:** Workflow bar state line; financial summary card.

### Current click paths

| Path | Clicks |
|------|--------|
| Profile → 360 bar primary | 1 |
| Profile → Primary actions (duplicate CTAs) | 1–2 |
| Profile → stat cards (read-only duplicate state) | 0 (noise) |

### Recommended single path

Profile → 360 bar → primary target (`#open-bills`, KYC workspace, beds command center, deposit page).

| Metric | Before | After |
|--------|--------|-------|
| Primary action strips | 2 | 1 |
| Clicks to collect rent | ~2 | ~2 (360 → open bills) |

### Changes applied

- Removed duplicate primary actions and stat cards.
- Bed assignment primary now points to `/admin/beds?customerId=` (not `#assign-bed`).

---

## 4. Operations home

**Discover:** Sidebar Operations → `/admin/operations/residents`.

**Execute:** Hero next action + action queue row primary button.

**Verify:** Queue count, journey panel, activity feed.

### Current click paths (duplicates)

| Path | Clicks |
|------|--------|
| Hero → next queue item | 1 |
| Command center → filter → queue | 2–3 |
| Command center payment proof → filter → N identical rows | 3–4 |
| Advanced tools → Payment reviews / Vacating / Beds | 2 |

### Recommended single path

Hero or command center card → queue filter (resident-specific) OR external module (payment proofs → Payment Reviews).

| Metric | Before | After |
|--------|--------|-------|
| Payment proof via queue | 3–4 per proof | 2 (card → reviews page) |
| Duplicate proof rows in queue | N | 0 |

### Changes applied

- Payment proof removed from queue; card links to Payment Reviews.
- `?filter=payment_proof` redirects to Payment Reviews.

---

## 5. Move-out pipeline

**Discover:** Ops command center “Move-outs awaiting action”; `/admin/vacating`.

**Execute:** `/admin/vacating` (unified pipeline); checkout settlement detail when approved.

**Verify:** Vacating list status; settlement row status.

### Current click paths (duplicates)

| Path | Clicks |
|------|--------|
| Vacating → unified pipeline | 2 |
| Ops queue pending → `/admin/vacating?legacy=1&status=pending` | 3 |
| Advanced tools → Vacating + Checkout settlements | 2 each |

### Recommended single path

Ops queue or Vacating sidebar → `/admin/vacating` → row action → settlement if needed.

| Metric | Before | After |
|--------|--------|-------|
| Pending move-out entry | 2 (legacy + unified) | 1 |
| Clicks from ops queue (pending) | 3 | 2 |

### Changes applied

- Ops queue pending move-out links to `/admin/vacating` (removed `legacy=1`).

---

## 6. Bed assignment command center

**Discover:** `/admin/beds`; ops queue “Waiting bed assignment”; residents list badge.

**Execute:** `/admin/beds?customerId=` — map, queue, recommendations.

**Verify:** Bed map occupancy; profile bed badge.

### Current click paths (duplicates)

| Path | Clicks |
|------|--------|
| `/admin/beds?customerId=` | 2 |
| Residents table → Assign bed → `/admin/bookings/new?customerId=` | 3–4 |
| Residents page header → Assign tenant → `/admin/bookings/new` | 2–3 |
| Profile → `#assign-bed` inline `AssignTenantForm` | 1 (same page, duplicate UI) |
| 360 bar → `#assign-bed` | 1 scroll |

### Recommended single path

Any discover → `/admin/beds?customerId=` → assign on map/queue.

| Metric | Before | After |
|--------|--------|-------|
| Assign entry points | 4 | 1 |
| Clicks from residents table | ~4 | ~2 |
| Clicks from profile (360) | ~2 (scroll + form) | ~2 (360 → beds page) |

### Changes applied

- Profile inline assign form replaced with link to bed command center.
- 360 bar assign href → `/admin/beds?customerId=`.
- Residents table “Assign bed” → `/admin/beds?customerId=`.
- Residents page header: removed duplicate “Assign tenant” (`/admin/bookings/new`).

---

## 7. Deposit timeline

**Discover:** Ops queue (deposit refund requests); profile 360 when deposit due.

**Execute:** `/admin/deposits/[bookingId]` — `DepositWorkflowHeader` + existing forms.

**Verify:** Deposit summary card; wallet balance on page.

### Current click paths (duplicates)

| Path | Clicks |
|------|--------|
| 360 bar → deposit page | 2 |
| Primary actions → Open security deposit | 2 |
| Advanced tools → deposit via action bar | 3 |
| Stat card “Security deposit” (read-only) | 0 |

### Recommended single path

360 bar or ops queue → `/admin/deposits/[bookingId]`.

| Metric | Before | After |
|--------|--------|-------|
| Deposit CTAs on profile | 2–3 | 1 (360 bar) |
| Clicks when deposit due | ~2 | ~2 |

### Changes applied

- Removed Primary actions deposit link and duplicate stat card.
- Advanced tools action bar removed (deposit collect was duplicated in inline bills / 360).

---

## 8. KYC workspace

**Discover:** Ops command center “Pending KYC”; `/admin/residents/kyc` (auto-redirect to first pending).

**Execute:** `/admin/residents/kyc/[submissionId]`.

**Verify:** Profile identity badge; KYC queue clears.

### Current click paths (duplicates)

| Path | Clicks |
|------|--------|
| KYC queue → workspace | 2 |
| Profile 360 → Review KYC | 2 |
| Profile Primary actions → Review identity | 2 |
| Not verified banner → KYC list | 2 |

### Recommended single path

Ops queue or profile 360 → KYC workspace URL.

| Metric | Before | After |
|--------|--------|-------|
| KYC CTAs on profile | 2 | 1 (360 bar) |
| Clicks from profile | ~2 | ~2 |

### Changes applied

- Removed duplicate KYC link from Primary actions (component removed entirely).

---

## Redirects (unchanged, for reference)

| Legacy route | Canonical |
|--------------|-----------|
| `/admin/payments` | `/admin/operations/payment-reviews` |
| `/admin/collections?tab=approvals` | `/admin/operations/payment-reviews` |
| `/admin/kyc` | `/admin/residents/kyc` |
| `/admin/operations` | `/admin/operations/residents` |

---

## Priority implementation log

1. **Payment collection paths** — PgCollectionsPanel, billing primary actions, ops queue, profile billing strips.
2. **Bed assignment paths** — profile form, 360 href, residents table, residents page header.
3. **KYC review paths** — removed profile Primary actions duplicate.
4. **Move-out paths** — unified vacating href in ops queue.
5. **Deposit actions** — removed Primary actions / action bar / stat card duplicates.

---

## Out of scope (intentional)

- `/admin/bookings/new` remains for admin-created bookings from bookings module and bed map “new booking on bed” flows.
- Revenue billing page structure unchanged (generation + tabs).
- Advanced tools on ops home (module links) kept as secondary discover only.
- `EditTenantTenancyForm` on profile for bed *changes* (not initial assignment) — distinct from assign queue.
