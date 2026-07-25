# Checkout settlement state machine (admin SSOT)

**Platform status: frozen** (2026-07-25). Do not redesign this state machine or business terminology without a documented platform change proposal. Governance: [`docs/CHECKOUT_PAYOUT_PLATFORM_FREEZE.md`](../../CHECKOUT_PAYOUT_PLATFORM_FREEZE.md).

One **settlement decision** at `awaiting_admin_review`. Payout work after deferral is **not** a second settlement approval.

## States (DB enum)

| Status | Meaning |
|--------|---------|
| `awaiting_resident_details` | Waiting for resident meter / UPI submission |
| `awaiting_admin_review` | **Single admin decision** — review charges and finalize |
| `refund_pending` | Checkout finalized; **payout only** outstanding |
| `completed` / `refund_paid` | Terminal |
| `archived` | Removed from active ops |

Legacy `approved` may exist on old rows; pipeline treats it like in-progress checkout.

## Admin intents

| Intent | From | To | Server |
|--------|------|-----|--------|
| `finalize_zero_refund` | `awaiting_admin_review` | `completed` | `approveCheckoutSettlement` |
| `finalize_with_refund_paid` | `awaiting_admin_review` | `completed` | `approveCheckoutSettlement` + `markCheckoutRefundPaid` |
| `finalize_defer_payout` | `awaiting_admin_review` | `refund_pending` | `approveCheckoutSettlement` only |
| `record_refund_payout` | `refund_pending` | `completed` | `markCheckoutRefundPaid` only |
| `reject_submission` | `awaiting_admin_review` | `awaiting_resident_details` | `rejectResidentCheckoutSubmission` |

## Operations routing

| Settlement status | Ops filter | Move-out stage label |
|-------------------|------------|----------------------|
| `awaiting_admin_review` | `vacating_requests` (`filter=checkout` alias) | Settlement Review |
| `refund_pending` | `refund_due` | Payout pending |
| `completed` / `refund_paid` | — | Completed |

## Side effects (all finalize\*)

- Deductions, vacating finalize, bed release (when applicable), `amountsLocked`, audit `approved`
- `resolveCheckoutReviewActionItems` — clear settlement review notification
- On `completed` only: deposit refund ledger, booking refund status, resolve stale refund action items

## Idempotency

Retries on terminal states or `refund_pending` after defer must not duplicate ledger (`checkout:{settlementId}`), audit, or payouts.

Implementation: [`src/services/checkoutSettlement.ts`](../../src/services/checkoutSettlement.ts), actions in [`app/(admin)/admin/checkout-settlements/actions.ts`](../../app/(admin)/admin/checkout-settlements/actions.ts).

---

## Terminology Rules (product SSOT)

**Frozen standard** for all future UI, documentation, and features. Code display strings: [`src/lib/payout/payoutDisplayTerminology.ts`](../../src/lib/payout/payoutDisplayTerminology.ts). Do not rename DB enums or API contracts without a **versioned migration**.

### Business workflow

- **Checkout** = resident leaving the property (notice, resident packet, settlement review, finalize).
- **Checkout is complete** once settlement is **finalized** (amounts locked, vacating completed, bed released when applicable).
- **Checkout never waits for payout.** Deferred UPI is a separate accounting track.

### Accounting workflow

- **Payout** = paying money to the resident **after** checkout is complete.
- **Payout is an accounting task**, not a checkout task (Refund of Deposit, ledger, UPI reference).

### Preferred terminology by layer

| Layer | Use | Do not use (post-finalize business UI) |
|-------|-----|----------------------------------------|
| **Business / Operations** | Pending Payouts · Record Payout · Payout Pending · Payout Completed | Refund Due · Refund Pending · Approve refund |
| **Resident portal** | Your payout is being processed. · Your payout has been completed. | Checkout pending (when only payout is outstanding) |
| **Accounting / ledger** | Refund of Deposit · Refund transaction · Deposit refund ledger | — |
| **Database / APIs** | Keep: `refund_pending`, `refund_due`, `refund_paid`, action item `type: refund_pending` | Display-only renames without migration |

Map internal `refund_pending` (settlement) to business copy **Payout Pending** — meaning *approved; payout not recorded*.

### Design rule

**Refund** and **Payout** are intentionally different concepts.

- **Checkout** belongs to the **business** workflow.
- **Payout** belongs to the **accounting** workflow.
- Accounting terminology must **never** make checkout appear incomplete.
- Checkout terminology must **never** imply a payout has already occurred.

---

## Terminology reference (implementation)

After **finalize**, checkout is closed; open work is treasury (pay resident + ledger proof).

### Business display names

| Concept | Display name |
|---------|--------------|
| Ops queue chip | **Pending payouts** (filter id `refund_due`) |
| Post-finalize status | **Payout pending** |
| Admin CTA | **Record payout** |
| Checkout-sourced ops row | **Checkout complete · payout pending** |
| Legacy deposit-only row | **Deposit payout pending** |
| Resident waiting | **Your payout is being processed.** |
| Resident done | **Your payout has been completed.** / **Payment completed on &lt;date&gt;.** |

### Accounting (stable identifiers)

| Internal | Meaning |
|----------|---------|
| `checkout_settlements.status = refund_pending` | Finalized checkout; payout not recorded |
| `refund_paid` / `completed` | Payout recorded or zero-refund closed |
| Ops filter `refund_due` | Pending payouts queue |
| Refund of Deposit workspace | Ledger workspace; business action **Record payout** |

### Enforcement checklist

1. No “Refund due/pending” on Operations for post-finalize `refund_pending` rows — use **payout** + **Checkout complete** where applicable.
2. No **Approve** on post-finalize payout tasks — only **Record payout**.
3. **Checkout** language until finalize; **payout** language in business UI after.
4. **Refund** wording allowed in Refund of Deposit, exports, and accountant docs only.
5. Resident UI must not imply checkout is open when only payout is outstanding.

