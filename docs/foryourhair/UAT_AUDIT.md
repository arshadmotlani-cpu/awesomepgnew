# For Your Hair ERP — User Acceptance Testing (UAT) Audit

**Date:** 2026-07-29  
**Mode:** QA / salon-owner lens — **audit only, no fixes applied in this pass**  
**Method:** Screen-by-screen review of implemented routes, components, server actions, and copy; cross-checked against RC integration/E2E coverage and real-day salon roles (receptionist, owner, stylist, cashier, manager).

**Browser matrix (Chrome / Safari / Edge, desktop + mobile):** Not executed in this session. Layout patterns (`md:` breakpoints, mobile nav, card fallbacks on some modules) were reviewed in code. **Schedule a half-day manual pass on target browsers before go-live** — especially calendar DnD, print dialog, and iOS Safari file upload on customer photo.

---

## Executive summary

The **core visit loop** (book → arrive → service → checkout → pay → print → timeline/commission/stock in backend) is usable and was exercised heavily in RC automation. For **daily salon operations**, several areas still feel **incomplete or misleading**: staff/scheduling admin, reports depth, retail billing, inventory operations, loyalty plan setup, and a **service consumable bug** that turns off stock deduction whenever a service is saved from the UI.

**UAT recommendation:** **Phase 1 (data integrity) resolved 2026-07-29** — UAT-C1 and UAT-C2 fixed. Remaining Major items still block “set and forget” production until P1 is approved and delivered.

---

## Phase 1 resolved (2026-07-29)

| ID | Resolution |
|----|------------|
| **UAT-C1** | `syncConsumables` preserves existing `deductInventory`; per-row “Deduct stock” on service form; regression tests in `serviceConsumablesPreserve.test.ts`. |
| **UAT-C2** | Dashboard **Staff on schedule** = distinct active stylists with a non–cancelled/no-show appointment today (salon TZ), excluding staff with `isOff` leave for that weekday. |

---

## 1. Critical issues

| ID | Status |
|----|--------|
| **UAT-C1** | **Resolved** (Phase 1) |
| **UAT-C2** | **Resolved** (Phase 1) |

<details>
<summary>Original critical findings (pre–Phase 1)</summary>

| ID | Area | What a salon user experiences | Why it matters |
|----|------|------------------------------|----------------|
| **UAT-C1** | Services → Inventory | Owner attaches shampoo to a haircut and saves the service. UI says consumables “reduce stock when the invoice is paid.” After save, **`deductInventory` is always stored as `false`** (`syncConsumables` in `salonServices.ts`). | Back-room stock stops matching reality after any service edit; trust in inventory and COGS breaks. Seed/RC DB can look fine until someone edits a service in the app. |
| **UAT-C2** | Dashboard KPI | **“Staff Working”** card suggests stylists on the floor **today**. Value is **`count(active staff)`**, not appointments-in-progress or scheduled-on-shift. | Owner makes staffing decisions on a false signal during busy hours. |

</details>

---

## 2. Major issues

| ID | Checklist area | Finding |
|----|----------------|---------|
| **UAT-M1** | Staff — hours, leave, commission | **No UI** for weekly schedules, lunch, or `isOff` (leave). Validation exists in booking engine only if rows exist in DB. Staff create is name/phone/role only — no commission defaults, no edit/deactivate flow. |
| **UAT-M2** | Calendar — chairs | **No admin UI** to add/rename chairs/resources; relies on seed/DB. Reception cannot fix “wrong chair list” without developer. |
| **UAT-M3** | Billing — create invoice | **No standalone retail / walk-up invoice** UI. Billing copy mentions “retail sales,” but invoices are created via **appointment checkout** only. |
| **UAT-M4** | Billing — PDF | **Print HTML only** (`window.print()`). **No PDF download** or email receipt. Cashier workflow on tablet often expects share/PDF. |
| **UAT-M5** | Reports | Only **three revenue totals** (today / week / month). **No** service mix, stylist performance, customer ranking, inventory valuation, or **GST summary** — despite README/marketing-style module list implying richer reports. |
| **UAT-M6** | Reports / Dashboard — timezone | **Today’s revenue** uses salon timezone (`todayRevenuePaise` + settings). **Week/month aggregates** in `reports.ts` use **server-local midnight** boundaries, not `salonDayBounds`. Owner near midnight or non-IST TZ can see **today vs week mismatch**. |
| **UAT-M7** | Loyalty | Sell membership/package/bridal works, but **no UI to create or edit plans** (empty state points to “DB seed or follow-up”). Manager cannot change pack price or sessions without DB. |
| **UAT-M8** | Inventory | Page is **read-only** stock table. **No** movement history, adjustments, purchase inward, or link from low-stock alert to product edit. |
| **UAT-M9** | Customers — delete | **Archive only** (acceptable policy), but **no restore** for archived customers in UI; reception may treat “Archive” as reversible without training. |
| **UAT-M10** | Calendar — week/timeline | **Week** and **timeline** views are **list/read-only** — no drag, resize, or quick status from those views. Reception may expect one calendar behavior everywhere. |
| **UAT-M11** | Calendar — notes | Appointment **notes editable only at create**; detail drawer is display-only. Stylist color notes mid-service cannot be updated. |
| **UAT-M12** | Payments | **Gift card** payment path throws at server; customer profile says gift cards not enabled. Mixed pay otherwise OK (cash/UPI/card/wallet). |
| **UAT-M13** | Notifications | Outbox queued; **WhatsApp/SMS/email not connected**. Loyalty page is honest; reception must not promise auto confirmations to clients. |
| **UAT-M14** | Auth | **Forgot password** is a dead link (`preventDefault`, “Coming soon”). Single shared admin — **no roles** (stylist vs cashier vs owner). |
| **UAT-M15** | Mobile — tables | **Customers, billing, staff, inventory** use **wide tables** without mobile card layout (unlike services/products). Horizontal scroll on 390px — error-prone for reception. |

---

## 3. Minor polish issues

| ID | Area | Detail |
|----|------|--------|
| **UAT-N1** | Customers → Timeline | Footer still says events “will appear … as those modules go live” while timeline already shows bills/appointments. |
| **UAT-N2** | Dashboard | Subtitle “Today at a glance” shows **total active customers**, not “today’s footfall” — easy to misread. |
| **UAT-N3** | Dashboard | **No charts** — only KPI cards and lists. Checklist “verify charts” → N/A; set expectations with owner. |
| **UAT-N4** | Settings | **No logo/branding** upload or receipt header preview — only text identity + GSTIN (no format validation). |
| **UAT-N5** | Profile | Admin **profile is read-only**; sign-out only from top bar. |
| **UAT-N6** | Services UI | Copy references “deduction enabled” rows but **no per-row toggle** in form — copy does not match controls. |
| **UAT-N7** | Loyalty | Package plan empty state language is **developer-facing** (“DB seed”). |
| **UAT-N8** | Search | No dedicated search results page — dropdown only; fine for power users, easy to miss on mobile. |
| **UAT-N9** | Status labels | Raw appointment status strings in dashboard schedule (`in_service`) — not humanized for front desk. |
| **UAT-N10** | Archive actions | Services/products/customers use **Archive** not Delete — good for audit trail; needs **one-line staff training** doc. |

---

## 4. UX improvements (workflow & clicks)

**Receptionist**

- **New appointment:** Calendar create + walk-in checkbox + multi-service + chair — strong on **day/stylist/chair** views; weak when user lands in **week** view expecting drag.
- **Conflict errors:** Server messages (“already booked”, lunch break) — ensure they surface in drawer toast/alert consistently (verify in manual pass).
- **Customer create:** Duplicate phone flow with force-create is powerful but **heavy** for busy desk — consider clearer “Use existing customer” shortcut (future).

**Cashier**

- Checkout lives in **calendar drawer** and **billing detail** — two entry points; train which is default.
- **Split payment** requires understanding paise/rupee fields — validate decimal and overpay messaging on manual pass.
- **Print** opens new window — popup blockers on Safari/iOS need one-time allow.

**Salon owner**

- **Morning routine:** Dashboard schedule + pending payments useful; **Staff Working** card should be fixed or renamed before owner trusts dashboard in stand-ups.
- **End of day:** Reports too thin for “how did we do?” — owner will export from billing list or ask for Excel (not available).

**Stylist**

- No stylist login — entire ERP is **front-desk/admin**. Stylist cannot see own column-only view on phone.

**Manager**

- Commission **mark paid** on loyalty hub works; **no per-stylist statement** or period filter.

---

## 5. Visual improvements

- **Consistency:** Primary actions use `Button` variants well; **Archive** blocks at bottom of profile feel disconnected from tabbed layout.
- **Spacing:** Glass panels and `fyh-display` headings are cohesive; **dense tables** on billing/inventory feel “admin spreadsheet” vs luxury brand on marketing login.
- **Alignment:** Calendar grid is complex — manual pass for **overflow** on small laptops (1280×800) recommended.
- **Icons:** Dashboard KPIs have icons; **reports/inventory** are text-heavy — optional iconography for scanability.
- **Theme:** Light/dark toggle on login; app shell theme behavior — confirm contrast on **warning** low-stock rows in light mode (manual).
- **Accessibility:** Login form labels good; **timezone** is free-text IANA — typo breaks calendar bounds with little inline help (placeholder only).

---

## 6. Performance observations

| Observation | Impact |
|-------------|--------|
| **Server-rendered pages** without route-level `loading.tsx` | Navigation can show **blank or stale content** until RSC resolves; noticeable on `next dev` first hit to dashboard/loyalty. |
| **Dashboard snapshot** | Multiple sequential DB round-trips (schedule + per-appointment services) — acceptable for one salon; may **slow** with hundreds of same-day appointments. |
| **Global search** | Debounced fetch — good; min 2 chars — reception may think search is broken for 1-char phone prefix. |
| **Calendar client bundle** | DnD + drawers — heaviest screen; expect **longer TTI** on mid-range phones. |
| **Photo upload** | Depends on Vercel Blob env — failure modes should be tested in staging. |

---

## 7. Recommended fixes (prioritized — for product backlog, not auto-applied)

### P0 — Before first real salon day

~~1. **UAT-C1:** Persist `deductInventory` from service form (or remove misleading copy); never force `false` on save.~~ **Done (Phase 1)**  
~~2. **UAT-C2:** Fix or rename **Staff Working** KPI (e.g. count distinct `staffId` on today’s non-terminal appointments, or “Active staff profiles”).~~ **Done (Phase 1)**  
~~3. **UAT-M6:** Align week/month report boundaries with **salon timezone** (`salonDayBounds` / settings).~~ **Done (Final Stabilization W1)**  
~~4. **UAT-M15:** Mobile-friendly **billing + customers** list (cards or stacked rows).~~ **Done (Final Stabilization W1)**

### P1 — First month of UAT

~~5. **UAT-M1 + M2:** Staff schedule editor + resource/chair CRUD (even minimal).~~ **Done (Final Stabilization W2 — staff schedules + settings resources)**  
~~6. **UAT-M3:** Retail invoice OR honest billing copy + link to products POS path.~~ **Done (billing copy + products path note)**  
~~7. **UAT-M5:** Minimum reports: **top services**, **revenue by staff**, **GST collected** for period.~~ **Done (reports page)**  
8. **UAT-M7:** Loyalty plan CRUD (membership + package).
9. **UAT-M8:** Stock adjustment + movement log viewer.
10. **UAT-N1, N6, N7:** Copy honesty pass on timeline, consumables, loyalty empty states.

### P2 — Polish & parity

11. **UAT-M4:** PDF or “Save as PDF” guidance in print CSS.
12. **UAT-M10, M11:** Notes edit; consistent interactions on week view.
13. **UAT-M14:** Password reset or remove forgot-password link.
14. **Loading skeletons** on dashboard, calendar, billing list.
15. **Browser QA matrix** (Chrome/Safari/Edge) with signed checklist in `docs/qa/hair-rc/`.

---

## Manual checklist — screen-by-screen scorecard

Legend: **✓** production-quality for v1 · **~** partial · **✗** missing or misleading

| Section | ✓ | ~ | ✗ | Notes |
|---------|---|---|---|--------|
| **Dashboard** cards | | ✓ | | KPIs exist; Staff on schedule fixed (Phase 1); no charts |
| **Dashboard** empty/loading | ✓ | | | Empty panels OK; no loading skeleton |
| **Dashboard** mobile | | ✓ | | KPI grid wraps; lists readable |
| **Customers** CRUD | | ✓ | | Create/edit/archive; no hard delete/restore |
| **Customers** search/duplicate | ✓ | | | List search + phone uniqueness |
| **Customers** notes/loyalty/timeline | | ✓ | | Notes OK; wallet top-up; timeline footer stale |
| **Services** CRUD/categories/GST | ✓ | | | Archive not delete |
| **Services** consumables | ✓ | | | Phase 1: deduct preserved + UI toggle |
| **Staff** hours/leave/commission | ✓ | | | Weekly schedule editor on Staff; commission on paid invoices |
| **Calendar** create/move/resize | ✓ | | | Day/stylist/chair |
| **Calendar** walk-in/multi/chair/conflict | ✓ | | | |
| **Calendar** cancel/no-show/complete | ✓ | | | |
| **Billing** invoice/pay/split/GST | | ✓ | | Appointment checkout; mobile cards; honest retail copy |
| **Billing** print/PDF | | ✓ | | Print yes; PDF deferred (P2) |
| **Inventory** deduction/consumption | | ✓ | | Backend OK if flag true; UI ops missing |
| **Inventory** alerts | ✓ | | | Low stock on dashboard + inventory highlight |
| **Reports** revenue/services/staff/GST | ✓ | | | Salon TZ; top services, staff revenue, GST |
| **Settings** profile/tax/hours | ✓ | | | No branding |
| **UX** confirmations | | ✓ | | Archive/submit often **no confirm dialog** |
| **Browser** cross-browser | | | ? | **Manual pass required** |

---

## Role simulation — “One salon day”

| Time | Role | Expected flow | UAT risk |
|------|------|---------------|----------|
| Open | Owner | Dashboard + low stock | Staff Working wrong |
| 10:00 | Reception | Walk-in + chair + multi-service | OK on day view |
| 11:00 | Reception | Move appointment (drag) | Test Safari DnD manually |
| 12:00 | Stylist | (No login) | N/A — desk updates status |
| 13:00 | Cashier | Checkout + UPI + print | Popup blockers |
| 14:00 | Manager | Mark commissions paid | OK on loyalty |
| 15:00 | Owner | “Top service today?” | **Reports cannot answer** |
| 16:00 | Reception | Edit service prices/consumables | **May disable stock deduction (C1)** |
| Close | Owner | Day revenue vs week | **Timezone mismatch (M6)** |

---

## Related documents

- RC automation verdict: [`RELEASE_READINESS.md`](./RELEASE_READINESS.md) (automated gates; this UAT doc supersedes for **operational readiness** until P0 items closed).
- Re-run commands: [`../qa/hair-rc/README.md`](../qa/hair-rc/README.md).

---

*End of UAT audit — prioritize P0 backlog with salon stakeholders before first live customer week.*
