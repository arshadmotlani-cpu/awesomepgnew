# Awesome PG — Implementation Prompt for Cursor

Paste this directly into Cursor at the start of the redesign work. It assumes Cursor has full access to the actual Awesome PG codebase, database schema, and routes.

## ROLE

Act as a senior frontend engineer + UX implementer working inside an existing, live, production PG (paying-guest accommodation) management platform called Awesome PG. You are **NOT** building a new app. You are re-skinning and re-structuring the presentation layer of a working system without breaking any business logic.

## NON-NEGOTIABLE BOUNDARIES

- Do **NOT** redesign the Admin Panel.
- Do **NOT** change financial logic, calculations, or rounding.
- Do **NOT** change booking logic.
- Do **NOT** change the KYC workflow or its approval states.
- Do **NOT** change database schema, tables, or relationships.
- Do **NOT** create new sources of truth for: wallet balances, deposit balances, occupancy, revenue, bed assignments, electricity calculations, or invoices. The frontend displays data; the backend remains authoritative.
- Do **NOT** touch authentication, permissions, or role logic (user / resident / admin / super admin).

**Scope is strictly:** the customer-facing public website + the customer/resident dashboard.

If at any point a desired visual/UX change would require changing backend logic to achieve, **stop and flag it** rather than changing the logic. Redesign around existing logic, not through it.

---

## PHASE 0 — MANDATORY AUDIT (DO NOT SKIP, DO NOT WRITE UI CODE BEFORE THIS IS DONE)

Before changing any screen, build a complete feature inventory of the existing system:

1. Enumerate every route (public + account + resident).
2. Enumerate every database table touched by the customer-facing flows (PGs, rooms, beds, occupancy, bookings, KYC, deposits, wallet, rent invoices, electricity invoices, requests, referrals, notifications).
3. Enumerate every API endpoint / server action these routes call.
4. Enumerate every permission check involved in customer-facing flows.
5. Enumerate every financial calculation involved (deposit, rent, electricity, refund, deductions) — note them as **"do not modify,"** not as something to re-derive.
6. Enumerate the full KYC state machine.
7. Enumerate the full wallet/deposit lifecycle (held → deducted → refunded).
8. Enumerate the full checkout/vacating settlement flow.
9. Enumerate existing integrations referenced anywhere in customer-facing code: QR/UPI payments, WhatsApp, search/filters, notifications, referral system, analytics/reporting hooks.

For every existing customer-facing page, answer before touching it:

- What data powers it (which table/endpoint)?
- What user actions affect it (which endpoint/mutation)?
- What other modules depend on it or its data?
- What would break elsewhere if this page's data shape changes?

**Output of Phase 0:** a written feature inventory (`docs/feature-inventory.md`) that you reference for the rest of this work. Do not proceed to Phase 1 until this exists and the existing routes/APIs/permissions/calculations above are confirmed understood.

**Status:** ✅ Completed — see [`feature-inventory.md`](./feature-inventory.md)

---

## PHASE 1 — DESIGN SYSTEM SETUP

Implement the design system described in [`awesome-pg-ux-redesign-spec.md`](./awesome-pg-ux-redesign-spec.md) (Sections 3–6: Visual Design System, Motion Design System, 3D Interaction Strategy, Component Map). Specifically:

- Set up design tokens (color, type scale, spacing, elevation tiers) as reusable variables — do not hardcode values per-component.
- Build the shared component primitives first (Card elevation tiers, status chip, status timeline, count-up number, bed-state tile) before building any full page, since nearly every page in Phase 2 reuses these.
- Choose the 3D approach per Section 5 of the spec: CSS 3D transforms + Framer Motion for cards/explorers/bed-maps; reserve any WebGL/Three.js usage to at most one hero element, with a static-image fallback for low-end devices and `prefers-reduced-motion` users.
- Confirm mobile-first breakpoints and the bottom-nav pattern for the Resident Hub before building individual screens.

---

## PHASE 2 — PAGE-BY-PAGE IMPLEMENTATION

Implement in this order (highest conversion/retention impact first — matches Priority column in the spec's Section 2 table):

### Wave 1 (P0)

1. Home (cinematic hero, live availability strip, benefit-framed amenities)
2. PG Details (Property Overview, Floor Explorer, Room Explorer, Bed Explorer, Amenities, Reviews, Nearby, Availability)
3. Bed Map (visual states: available / occupied / reserved / selected, with hover/select/compare interactions)
4. Booking Flow (5-step guided journey with persistent stay-summary panel)
5. Resident Home (status chips, upcoming payments, pending requests)
6. Wallet (deposit ledger, rent/electricity history, transaction list, count-up balances)
7. Payments (pay rent, pay electricity, invoices)

### Wave 2 (P1)

8. Room Detail page
9. Application Dashboard (pre-resident status tracker)
10. Requests Center (all 10 request types, status timelines)
11. Vacating Journey (7-stage settlement timeline with itemized deductions)
12. Notification Center

### Wave 3 (P2)

13. Referrals (gaming-style progress visuals)
14. AI Concierge (chat surface reading the logged-in resident's own data only — strictly scoped, no cross-resident data exposure)

For each page, before writing code:

- Confirm against the Phase 0 inventory which existing endpoint(s) supply its data and which existing endpoint(s) its actions call.
- Re-use existing data-fetching/mutation logic. Wrap it in new presentation components; do not duplicate or re-implement it.
- After implementing, verify nothing that depended on this page's old markup/DOM structure (e.g. existing E2E tests, analytics event hooks, other pages linking into it) is broken.

---

## PHASE 3 — QA AGAINST THE FEATURE INVENTORY

Before considering any page "done":

- Walk every item in the Phase 0 feature inventory that touches this page and confirm it still functions identically from the user's perspective (only the presentation changed).
- Check for: broken links, missing routes, missing actions, missing permission checks, broken calculations, broken invoices, broken wallet figures, broken settlement math, broken occupancy counts, broken KYC state transitions.
- Confirm mobile performance: hero/interactive elements usable within ~2s on a mid-range Android device on 4G.
- Confirm `prefers-reduced-motion` is respected and there is a non-animated fallback path for every animated state.

---

## INTERLINKING REQUIREMENT

These existing relationships must remain intact and navigable across the redesigned screens — do not let any of them become a dead end or a duplicated/conflicting display of the same number:

- Deposit ↔ Invoice ↔ Wallet ↔ Resident Profile ↔ Checkout Settlement ↔ Refund Requests ↔ Resident Home ↔ Revenue Reports (admin-side, read-only reference)
- Bed Assignment ↔ Occupancy ↔ Resident ↔ Room Map ↔ Checkout ↔ Vacating
- KYC ↔ Resident Status ↔ Verification ↔ Resident Home ↔ Requests Center

---

## WORKING STYLE FOR THIS SESSION

- Treat yourself as simultaneously: product designer, UX designer, system architect, frontend engineer, QA tester, and PG operations consultant.
- If you discover a customer-facing feature that exists in the codebase but wasn't mentioned in this prompt, add it to the Phase 0 inventory, preserve it, and redesign it consistently with this system rather than skipping it.
- Functionality always outranks visual polish. If a visual idea from the design spec would require touching protected business logic to implement faithfully, implement a simpler version that doesn't touch the logic, and **flag the tradeoff** rather than silently cutting a corner.
- Work in small, reviewable increments per page/component rather than one giant diff — this keeps the "nothing broke" verification in Phase 3 actually checkable.

---

## REFERENCE

Full design rationale, sitemap, design tokens, motion catalog, 3D strategy, component map, and user journeys: see [`awesome-pg-ux-redesign-spec.md`](./awesome-pg-ux-redesign-spec.md).
