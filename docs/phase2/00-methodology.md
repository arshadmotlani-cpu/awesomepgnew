# Phase 2 — Screen Redesign Methodology

**Approved:** 2026-06-19  
**Status:** In execution — public website (P2) deferred until admin/resident P0 complete

---

## Non-negotiable constraints

For every screen redesign:

- Preserve existing business logic
- Preserve permissions (`requireAdminPermission`, server action guards)
- Preserve financial calculations (`residentFinancialEngine`, `deposit_ledger`, invoice services)
- Preserve workflow state machines (invoice, deposit, vacating, KYC)

**Presentation layer only.** No changes to `src/services/*` financial modules unless a separate bug fix is approved.

---

## Per-screen workflow (required before UI changes)

1. **Document every action** on the screen (links, buttons, forms, modals).
2. **Classify each action:**
   - **Primary** — needed daily; safe; answers “what should I do now?”
   - **Secondary** — useful context or navigation; not urgent
   - **Advanced** — rare, destructive, or requires training (ledger rebuild, charge generator, archive)
3. **Cap visible primary actions at five.**
4. **Move Advanced** into a collapsed “Advanced tools” section (pattern: `AdminAdvancedToolsSection`).
5. **Rewrite copy** in plain language — no SSOT, enum names, or internal module jargon on the surface.

---

## Success metric

A first-time user should understand within **5 seconds**:

- **Where they are**
- **What they can do**
- **What happens next**

Design priorities (in order):

1. Clarity over futurism
2. Operational speed over visual effects
3. Trust over aesthetics

---

## Execution order (approved)

### P0 — Highest business impact

| # | Screen | Route(s) | Audit doc |
|---|--------|----------|-----------|
| 1 | Resident profile | `/admin/residents/[customerId]` | [p0-01-resident-profile.md](./p0-01-resident-profile.md) |
| 2 | Deposit detail | `/admin/deposits/[bookingId]` | TBD |
| 3 | Billing | `/admin/revenue/billing` | TBD |
| 4 | Checkout / vacating | `/admin/vacating`, `/admin/checkout-settlements/*` | [p0-04-checkout-vacating.md](./p0-04-checkout-vacating.md) |
| 5 | Bed assignment | `/admin/pgs/[pgId]/map`, assign flows | [p0-05-bed-assignment.md](./p0-05-bed-assignment.md) |
| 6 | KYC queue | `/admin/residents/kyc` | [p0-06-kyc-queue.md](./p0-06-kyc-queue.md) |

### P1

Resident Home · Requests Center · Wallet · Payments · Application Dashboard

### P2 (last — not started until P0/P1 stable)

Public Home · Property Pages · Room Explorer · Bed Explorer · Booking Flow

---

## Shared UI patterns

| Component | Purpose |
|-----------|---------|
| `AdminAdvancedToolsSection` | Collapsible `<details>` wrapper for advanced actions |
| `PageHeader` | Title + one-line plain description |
| Primary action row | Max 5 buttons; orange primary, bordered secondary |

Money always via `paiseToInr` / existing formatters — never raw paise in labels.
