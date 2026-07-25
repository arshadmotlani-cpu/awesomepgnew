# Checkout / payout platform freeze

**Effective:** 2026-07-25  
**Status:** **Frozen** — treat checkout workflow, ops routing, and business terminology as a **stable platform**, not an evolving design.

This freeze is **separate** from the settlement **math** freeze in [`SETTLEMENT_ENGINE_FREEZE.md`](./SETTLEMENT_ENGINE_FREEZE.md). Platform changes do not reopen billing formulas; engine changes do not imply workflow redesign.

---

## Authoritative SSOT (read first)

Before any work on move-out, settlement, refund, payout, deposits, accounting, or Operations:

| Artifact | Purpose |
|----------|---------|
| [`docs/SYSTEM/CHECKOUT_SETTLEMENT_STATE_MACHINE.md`](./SYSTEM/CHECKOUT_SETTLEMENT_STATE_MACHINE.md) | States, admin intents, ops routing, idempotency |
| Same doc, **Terminology Rules (product SSOT)** | Business vs accounting vocabulary |
| [`src/lib/payout/payoutDisplayTerminology.ts`](../src/lib/payout/payoutDisplayTerminology.ts) | Business-layer display strings (import; do not duplicate) |

---

## Policy

- **Do not** redesign the checkout state machine unless a **new documented business requirement** proves the current machine insufficient.
- **Do not** rename terminology outside **versioned product decisions**.
- **Do not** rename DB enums or API contracts (`refund_pending`, `refund_due`, `refund_paid`, etc.) without a **versioned migration**.

Checkout and payout are **separate business events**:

- **Checkout** (business) = resident leaving; **complete at finalize**; checkout **never waits for payout**.
- **Payout** (accounting) = paying the resident **after** checkout; Refund of Deposit / ledger / UPI proof.

---

## Rules for future features

1. **Reuse existing states** before introducing new settlement statuses.
2. **Reuse existing terminology** ([`payoutDisplayTerminology.ts`](../src/lib/payout/payoutDisplayTerminology.ts)) before creating new labels.
3. **Reuse existing Operations queues** (`vacating_requests`, `refund_due`, …) before adding new filter chips.
4. **Preserve the invariant** that checkout and payout are separate (no second settlement approval; no “checkout incomplete” because payout is open).
5. If a feature **requires changing this architecture**, document **why the current state machine is insufficient** before proposing modifications (see template below).

---

## Allowed without reopening the platform

- Bug fixes that **preserve** transitions and invariants
- New UI that **calls existing** server actions (`approveCheckoutSettlement`, `deferCheckoutRefundPayoutAction`, `completeCheckoutSettlementAction`, `markCheckoutRefundPaid`, …)
- Copy/layout changes using **SSOT terminology constants**
- Docs, tests, and observability that describe current behavior

---

## Platform change proposal (required to reopen)

Use this checklist in a doc, PR description, or `docs/MEMORY/decisions.md` entry:

1. **Problem** — what business outcome is blocked?
2. **Why SSOT is insufficient** — which state(s), queue(s), or terminology rules fail today?
3. **Proposed delta** — new states/queues/labels only if reuse is impossible
4. **Migration impact** — DB, API, action items, notifications, resident copy
5. **Invariant checklist** (must remain true unless explicitly waived with owner approval):
   - One settlement decision per checkout at `awaiting_admin_review`
   - No second “approve settlement” for payout-only work
   - `refund_pending` rows route to **Pending payouts** (`refund_due`), not move-out settlement review
   - Pay-now path: terminal `completed` without sustained Refund Due task
   - Defer path: checkout finalized; exactly one payout task surface (deduped by booking)
   - Accounting “refund” wording stays in ledger/Refund of Deposit; business UI uses “payout” after finalize

---

## Related

- Settlement mathematics: [`SETTLEMENT_ENGINE_FREEZE.md`](./SETTLEMENT_ENGINE_FREEZE.md)
- Cursor agent rule: [`.cursor/rules/checkout-payout-platform-freeze.mdc`](../.cursor/rules/checkout-payout-platform-freeze.mdc)
