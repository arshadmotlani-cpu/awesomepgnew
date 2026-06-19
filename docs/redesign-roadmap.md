# Awesome PG — Redesign Roadmap

**Updated:** 2026-06-19  
**Status:** Phase 2 **approved** — execution in progress  
**Inputs:** [feature-inventory.md](./feature-inventory.md), [risk-report.md](./risk-report.md), [phase2/00-methodology.md](./phase2/00-methodology.md)

---

## Principles (non-negotiable)

1. **Presentation layer only** — wrap existing loaders, actions, and services; do not reimplement calculations.
2. **SSOT services stay authoritative** — `residentFinancialEngine`, `deposit_ledger`, `depositInvoices`, snapshotted booking/vacating data.
3. **Permissions unchanged** — UI may hide actions by role but must not alter `roles.ts` or server guards.
4. **No route removals without redirects** — legacy URLs remain for bookmarks and WhatsApp links.
5. **Ship in small PRs** — one screen per review batch.
6. **Public website last** — P2 marketing/booking flows deferred until admin P0 and resident P1 are stable.

### Per-screen rules

1. Document every action on the screen.
2. Classify: Primary · Secondary · Advanced.
3. Max **five** visible primary actions.
4. Dangerous/rare actions → **Advanced tools** (collapsed).
5. Plain-language copy — clarity > futurism, speed > effects, trust > aesthetics.

**Success metric:** First-time user knows where they are, what they can do, and what happens next within **5 seconds**.

---

## Phase 1 — Audit ✅

| Deliverable | Status |
|-------------|--------|
| `docs/feature-inventory.md` | ✅ |
| `docs/redesign-roadmap.md` | ✅ |
| `docs/risk-report.md` | ✅ |

---

## Phase 2 — Screen redesign (approved execution order)

**Do not start public website (P2) until P0 admin + P1 resident screens are stable.**

### P0 — Highest business impact

| # | Screen | Route(s) | Audit | UI status |
|---|--------|----------|-------|-----------|
| 1 | **Resident profile** | `/admin/residents/[customerId]` | [p0-01](./phase2/p0-01-resident-profile.md) | ✅ Done |
| 2 | Deposit detail | `/admin/deposits/[bookingId]` | [p0-02](./phase2/p0-02-deposit-detail.md) | ✅ Done |
| 3 | Billing | `/admin/revenue/billing` | TBD | ⏳ |
| 4 | Checkout / vacating | `/admin/vacating`, `/admin/checkout-settlements/*` | TBD | ⏳ |
| 5 | Bed assignment | `/admin/pgs/[pgId]/map`, assign flows | TBD | ⏳ |
| 6 | KYC queue | `/admin/residents/kyc` | TBD | ⏳ |

### P1 — Resident-facing

| # | Screen | Route(s) | Status |
|---|--------|----------|--------|
| 1 | Resident Home | `/account/profile?section=resident&tab=home` | ⏳ |
| 2 | Requests Center | `tab=requests` | ⏳ |
| 3 | Wallet | `tab=wallet` | ⏳ |
| 4 | Payments | `tab=payments` | ⏳ |
| 5 | Application Dashboard | `/account/bookings`, booking detail | ⏳ |

### P2 — Public website (last)

| # | Screen | Route(s) | Status |
|---|--------|----------|--------|
| 1 | Public Home | `/` | ⏳ Blocked |
| 2 | Property Pages | `/pgs/[pgSlug]` | ⏳ Blocked |
| 3 | Room Explorer | `/pgs/[pgSlug]/rooms/[roomId]` | ⏳ Blocked |
| 4 | Bed Explorer | (within room flow) | ⏳ Blocked |
| 5 | Booking Flow | `/booking/new`, pay | ⏳ Blocked |

---

## Shared deliverables (lightweight, as needed per screen)

- `AdminAdvancedToolsSection` — collapsible advanced actions
- Plain-language status labels (see [risk-report.md](./risk-report.md) §3)
- Screen audit docs under `docs/phase2/`

**Not in scope for Phase 2:** Figma-first design system, public marketing refresh, financial formula changes, permission matrix changes, schema migrations for UX.

---

## Phase 3+ — Optional later

- Permissions-aware sidebar (hide vs disable)
- Merge duplicate API surfaces (engineering approval required)
- Retire legacy extension code paths
- Hindi/regional label pass
- Automated E2E redesign regression suite

---

## Approval record

| Decision | Date | Notes |
|----------|------|-------|
| Phase 1 audit approved | 2026-06-19 | Inventory + risk report |
| Phase 2 approved with modification | 2026-06-19 | Admin P0 first; public P2 last; per-screen methodology |

---

*Next gate: complete P0-1 Resident profile → review → P0-2 Deposit detail.*
