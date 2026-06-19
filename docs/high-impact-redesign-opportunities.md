# High-Impact Redesign Opportunities

**Created:** 2026-06-19  
**Context:** P0 admin redesigns improved code organization and copy but did **not** materially change daily staff workflows. This document lists only changes that would be **obviously noticeable** in real use — fewer clicks, less training, clearer status.

**Not included:** label renames, collapsed sections, duplicate stat removal, or “What to do next” blocks that repeat existing buttons.

---

## Cross-cutting diagnosis

| What P0 did | What staff still experience |
|-------------|----------------------------|
| Added summary cards + primary action row | Same page length; actions moved from visible → collapsed **Advanced tools** |
| Renamed enums to plain language | Same tables, forms, and multi-step flows |
| Capped “visible” actions at 5 | Full **Financial Command Center**, billing queue, and forms unchanged underneath |
| Documented before/after counts | No new **status model**, **progress UI**, or **workflow shortcuts** |

**Root gap:** Presentation cleanup without **workflow visualization** or **decision compression**.

---

## P0-1 — Resident Profile

**Route:** `/admin/residents/[customerId]`

### High-impact opportunities

| Priority | Opportunity | Why it matters | Saves |
|----------|-------------|----------------|-------|
| **P0** | **Single “resident state” banner** — one line: *Collecting rent · ₹X overdue* / *Move-out in progress* / *Needs identity* / *Ready to assign bed* | Staff currently parse 4 stat cards + banners + scroll | ~5–10 sec per open; reduces wrong action |
| **P0** | **Inline billing queue on profile** — top 3 open bills with one-click WhatsApp + record payment (no Advanced tools) | FCC + action bar hidden in Advanced; daily work is “send link + record cash” | 2–3 clicks per collection |
| **P1** | **Bed + rent edit as modal/drawer** from primary row | `#edit-tenancy` scroll on long page | 1 scroll + context switch |
| **P1** | **Move-out chip** linking vacating → checkout when active | Vacating/checkout are separate modules | 1–2 navigation hops |
| **P2** | **Merge stay details + summary cards** | Bed/contact/KYC/deposit shown twice (cards + stay section) | Cognitive load |

### Do not do (low impact)

- More plain-language labels on existing FCC presets  
- Additional summary stat cards  

---

## P0-2 — Deposit Detail

**Route:** `/admin/deposits/[bookingId]`

### High-impact opportunities

| Priority | Opportunity | Why it matters | Saves |
|----------|-------------|----------------|-------|
| **P0** | **Settlement progress stepper** — Collect → Hold → Charges → Refund pending → Refund sent (with current step highlighted) | Page is form-heavy; staff ask “where are we in refund?” | Training + phone calls |
| **P0** | **One “recommended action”** based on state — e.g. only show *Collect deposit* OR *Approve refund* prominently; rest collapsed | 3 activity forms + 2 settlement forms always visible | Wrong-form mistakes |
| **P1** | **Ledger as timeline** (not table) with running balance | Table requires mental math | Reconciliation time |
| **P1** | **Sync warning blocks primary actions** until resolved | Wallet mismatch buried in summary text | Support escalations |

### Do not do

- Renaming “Correct deposit” section only  
- Collapsing advanced without state-driven primary UI  

---

## P0-3 — Billing

**Route:** `/admin/revenue/billing`

### High-impact opportunities

| Priority | Opportunity | Why it matters | Saves |
|----------|-------------|----------------|-------|
| **P0** | **Collections work queue** — single sorted list: *Overdue → Due this week → Needs bill created → Waiting payment*, with bulk WhatsApp | “Need attention” tab still splits summary + primary actions + **full BillingOverviewPanel** + advanced | Daily billing run: 10+ min → target 3 min |
| **P0** | **Resident row = one action** — highest priority action only (Create bill / Send link / Record payment); secondary in row menu | Each row still exposes multiple concepts | Clicks per resident |
| **P0** | **Month progress bar** — “18 of 42 residents paid for March” | Stats show amounts but not completion | Prioritization |
| **P1** | **Payment proof → resident profile split view** | Approvals tab disconnected from resident context | Context switching |
| **P1** | **Persistent “who did I already remind today?”** | Bulk send has no memory | Duplicate WhatsApp |

### Do not do

- Tab rename only  
- Moving CollectionsBillingTools to Advanced without replacing daily queue UX  

---

## P0-4 — Checkout / Vacating

**Routes:** `/admin/vacating`, `/admin/checkout-settlements/*`

### High-impact opportunities

| Priority | Opportunity | Why it matters | Saves |
|----------|-------------|----------------|-------|
| **P0** | **Unified move-out pipeline view** — Kanban or stepper: Notice → Approved → Checkout open → Refund approved → Paid | Vacating table (11 cols) + separate settlements queue; staff learn two screens | Entire training module |
| **P0** | **Row → next step only** — e.g. pending shows **Approve**; approved shows **Open checkout** with settlement status inline | “More actions” still hides reject/cancel; primary varies by memory | 1 click + fewer errors |
| **P0** | **Checkout detail: refund calculator sticky** — deposit held, deductions, final refund always visible while scrolling forms | Summary exists but forms dominate | Refund disputes |
| **P1** | **Cross-link resident profile + vacating + settlement in fixed header** | Breadcrumbs only | Navigation |
| **P1** | **14-day notice visual** (calendar bar: notice given → vacating date) | Yes/No column in wide table | Explaining deductions to residents |

### Do not do

- Plain-language tab labels on settlements without pipeline view  
- Hiding reject in details without promoting approve/checkout  

---

## P0-5 — Bed Assignment

**Route:** `/admin/pgs/[pgId]/map`

### High-impact opportunities

| Priority | Opportunity | Why it matters | Saves |
|----------|-------------|----------------|-------|
| **P0** | **Floor plan default view** — room blocks sized by occupancy; click room → beds | Current view is bed tile grid + legend; hard to see “which room has space” | Assignment speed |
| **P0** | **Drag-to-assign or “assign next arrival” queue** | Assign flow is separate page + map click + panel links | 3+ screens for one assignment |
| **P0** | **Move-out beds visually distinct + click → checkout** | Legend exists but all tiles similar at glance | Wrong bed selection |
| **P1** | **Side panel: only next action** — assign / open profile / open checkout; move vacating forms to modal | Panel still dense; advanced collapsed but power users expand | Panel reading time |
| **P1** | **Empty bed: “Assign someone” opens inline picker** (verified residents without bed) | Links out to bookings/new | Navigation |

### Do not do

- 6 stats → 4 stats  
- Renaming panel sections without spatial/map improvement  

---

## P0-6 — KYC Queue

**Routes:** `/admin/residents/kyc`, `/admin/residents/kyc/[id]`

### High-impact opportunities

| Priority | Opportunity | Why it matters | Saves |
|----------|-------------|----------------|-------|
| **P0** | **Split-screen review** — photos left, approve/reject sticky right; queue list collapses | Verify page is better but queue still table → navigate → review | 1 click per item + faster review |
| **P0** | **Keyboard workflow** — next pending, approve, reject with reason templates | Mouse-only; no queue iteration | 30–60 sec per submission |
| **P0** | **Match score / checklist** — “Selfie visible · Aadhaar readable · Name matches profile” toggles | Validation JSON in Advanced; staff eyeball only | Wrong approvals |
| **P1** | **Side-by-side profile photo vs selfie** | Three equal thumbnails; no emphasis | Review quality |
| **P1** | **“Review all pending” mode** — auto-advance after decision | Back to queue each time | N × navigation |

### Do not do

- Summary cards counting pending (same info as before)  
- Moving PDF bulk download to Advanced (rare action) as “redesign”  

---

## P1 Resident — Apply learnings (not repeat P0 cleanup)

P1 already added the same pattern (summary + what to do next + More). **High-impact resident work** should prioritize:

| Screen | High-impact change | Maps from admin lesson |
|--------|-------------------|------------------------|
| **Home** | **One dominant status hero** (pay / move-out step / identity) — not 4 equal cards | Resident state banner |
| **Home** | **Move-out progress on home** when active (`VacatingJourneyTimeline`) | Unified pipeline |
| **Payments** | **Next bill hero** + pay in one tap; full tables secondary | Collections queue |
| **Requests** | **Open request = progress step**, not bullet list | Status tracking |
| **Wallet** | **Running balance story** (paid in → held → refunded) | Ledger timeline |
| **Application** | Journey tracker is good — add **blocked reason** on current step | State banner |

### Avoid on resident

- More “What to do next” sections with 5 similar buttons  
- Burying move-out or PS4 in collapsed More when they block the user  

---

## Recommended execution order (impact × effort)

1. **Billing collections queue** (admin) — highest daily volume  
2. **Move-out pipeline** (vacating + checkout unified)  
3. **Resident home status hero + vacating on home** (resident)  
4. **KYC split-screen + review mode**  
5. **Bed map floor-plan + inline assign**  
6. **Deposit settlement stepper**  
7. **Resident profile state banner + inline billing queue**  

---

## Success criteria (real usage, not docs)

A redesign phase is **high-impact** when a staff member or resident can answer without scrolling:

1. **What state is this person in?**  
2. **What is the one thing I should do now?**  
3. **What happens after I do it?**  

If the answer still requires opening Advanced tools or another module, the redesign is not done.
