# Financial Received-Amount Architecture — Audit & Implementation Plan

**Date:** 2026-07-21  
**Status:** Phase 1 in progress — payment allocation engine (2026-07-21)  
**Scope:** Move Awesome PG from assumed-deposit workflows to **received-amount SSOT**, admin-controlled payment allocation, and a unified **Checkout & Financial Workspace**.

**Related:** [[Deposits]] · [[Billing]] · [[Checkout Settlements]] · [[Vacating]] · [[Operations]] · `docs/FINANCIAL_SSOT_AUDIT_REPORT.md` · `docs/NOTICE_DEDUCTION_MIGRATION.md`

---

## Executive summary

Your business rule — **Required ≠ Received ≠ Outstanding** — is **partially implemented today** at the data layer but **not enforced end-to-end** in payment approval, UI, or every refund path.

| Layer | Today | Gap |
|-------|-------|-----|
| **Deposit required** | `bookings.deposit_paise` | OK — keep as contract snapshot |
| **Deposit received** | `deposit_ledger` (`collected` sum) | OK — ledger is wallet SSOT |
| **Deposit outstanding** | `bookings.deposit_due_paise` + `deposit_collection_status` | OK — partial deposit already supported |
| **Refund base** | Mostly `getDepositSummaryForBooking().refundableBalancePaise` | **Bug:** `refundConsole.ts` falls back to `bookings.depositPaise` when ledger empty |
| **Payment allocation** | Automatic rent-first waterfall (`splitBookingPayment`) | **Missing:** admin manual allocation at approve time |
| **Resident visibility** | RFE shows required/paid/outstanding for rent, elec, deposit | Inconsistent labels; allocation never shown (correct) |
| **Admin workspace** | Fragmented: Operations, vacating modal, checkout settlements, deposits | **Missing:** unified Checkout & Financial Workspace |

**Recommendation:** Do **not** replace the ledger/invoice model. **Extend and harden** it:

1. Make **admin allocation decisions** the canonical write path for ambiguous payments.
2. Make **`residentFinancialEngine.ts`** the only reader for Required / Received / Outstanding everywhere.
3. Build **one booking-scoped workspace** instead of a separate Move-out Review page.
4. Fix **known fallbacks** that treat required deposit as received.

---

## Architecture challenge (read before building)

### What you asked for is right — but half exists already

Partial deposit collection (`deposit_due_paise`, `partial` status, deposit-due Operations queue) shipped in migration `0042`. Checkout refunds already use **ledger balance**, not required deposit, in `checkoutSettlement.ts` and `checkoutRefundPreview.ts`.

The real problems are:

1. **Payment approval assumes allocation** via `splitBookingPayment()` (rent first, then deposit) — admin cannot assign ₹2,000 to deposit-only.
2. **Some UI and one refund fallback** still behave as if required = received.
3. **Financial decisions are scattered** across 5+ admin surfaces with no single review context.

### Proposed canonical model (extend, don't duplicate)

Every **financial obligation** (rent invoice, electricity invoice, deposit, custom charge) already has or can have:

```
requiredPaise   = invoice/rent line + late fees, or bookings.deposit_paise for deposit
receivedPaise   = sum(payments + ledger entries applied to that obligation)
outstandingPaise = max(0, required − received)
```

**SSOT reader:** `residentFinancialEngine.ts` — already implements this pattern for rent, electricity, deposit.

**Do not add parallel “required/received/outstanding” columns on every table.** Instead:

- **Invoices** remain line-item SSOT for rent/electricity/custom.
- **`deposit_ledger`** remains SSOT for deposit wallet movements.
- **New:** `payment_allocations` (or extend `payment_approval_allocations`) stores **admin-approved split** at proof-approval time, then drives ledger/invoice writes.

### Manual allocation design

When resident uploads ₹6,180:

| Step | Actor | Action |
|------|-------|--------|
| 1 | Resident | Upload screenshot only — no allocation UI |
| 2 | Admin | Review in workspace: suggested split + editable fields |
| 3 | System | Validate: `sum(allocations) = amount_received` |
| 4 | System | On Approve: write payments + ledger + invoice marks atomically |
| 5 | Audit | Persist allocation row (immutable after approve) |

**Suggested defaults** (admin can override):

- Show **outstanding balances** per category from RFE.
- Pre-fill allocation to clear oldest outstanding first (configurable), **not** hard-coded rent-first.

**Resident never sees:** allocation lines, admin notes, or “this went to deposit vs rent”.

### Post move-out: outstanding deposit

When tenancy ends with `deposit_due_paise > 0`:

- **Not collectible** — do not show in resident pay flows or Operations deposit-due queue.
- **Refund math uses received only** — already ledger-based; enforce no fallback to required.
- **New status:** extend `deposit_collection_status` with `closed_uncollected` (or use `waived` + audit reason) at vacating/checkout complete.
- **Reporting:** optional bad-debt / uncollected deposit metric for admin — not resident-facing.

### Unified workspace vs separate Move-out Review

**Agreed:** one **Checkout & Financial Workspace** replaces:

- Approve move-out confirm dialog
- Operations “Approve move-out” + More menu for financial items
- Scattered deposit/checkout/vacating links

**Canonical route (proposed):**

```
/admin/bookings/[bookingId]/financial
```

Alternate entry: `/admin/residents/[customerId]/financial?booking=[bookingId]`

**Not:** `/admin/vacating/[id]/review` — vacating is one tab inside booking financial context.

---

## 1. Database tables — audit

### Keep unchanged (SSOT already correct)

| Table | Role |
|-------|------|
| `bookings` | `deposit_paise` (required), `deposit_due_paise`, `deposit_collection_status` |
| `deposit_ledger` | Received, deducted, refunded movements |
| `rent_invoices` | Rent required/received via `paid_*` columns |
| `electricity_invoices` | Elec required/received |
| `financial_invoices` | Unified registry + breakdown JSON |
| `checkout_settlements` | Refund workflow + deduction snapshots |
| `vacating_requests` | Notice deduction snapshot (keep 14-day pro-rata policy) |
| `payments` | Money-in events |
| `pg_payment_records` | Pending proofs |

### Extend (migrations required)

| Change | Purpose |
|--------|---------|
| **`payment_approval_allocations`** — add columns | `rent_paid_paise`, `electricity_paid_paise`, `other_paid_paise`, `allocation_json` (line-item targets), `admin_edited` boolean, `remaining_unallocated_paise` |
| **OR new `payment_allocations`** table | Cleaner: one row per allocation line (`payment_id`, `target_type`, `target_id`, `amount_paise`) — preferred for multi-invoice splits |
| **`bookings.deposit_collection_status`** | Add `closed_uncollected` enum value for post-checkout write-off |
| **`checkout_settlements`** | Add `deposit_received_paise` snapshot at settlement open (ledger sum at that moment) — avoids confusion with `deposit_required_paise` |
| **`pg_payment_records`** | Optional: `pending_allocation_json` while in review (draft before approve) |

### Do NOT add

- Duplicate “received deposit” column on `bookings` — ledger sum is SSOT.
- Resident-visible allocation tables.

### Backfill / migration scripts needed

1. Reconcile `deposit_due_paise` from ledger vs required for all active bookings (`syncDepositCollectionFromLedger`).
2. Close deposit-due on completed vacatings where checkout finished.
3. Flag bookings where `bookings.deposit_paise` was used as refund display fallback historically.

---

## 2. Services — audit

### SSOT readers (extend, centralize)

| Service | Change |
|---------|--------|
| **`residentFinancialEngine.ts`** | Export `getBookingFinancialSnapshot()` — single object with rent/deposit/elec required/received/outstanding + refundable. All UI reads this. |
| **`deposits.ts`** — `getDepositSummaryForBooking()` | Add explicit aliases: `receivedPaise = collectedPaise`, `outstandingPaise = max(0, required − received)` helper |
| **`depositCollection.ts`** | Replace automatic-only `splitBookingPayment` with `applyAdminPaymentAllocation()` driven by allocation input |
| **`bookingLifecycle.ts`** | `recordPaymentSuccess` / `applyBookingPaymentFinancialMirrors` accept allocation payload, not pre-split |
| **`paymentApprovalAllocations.ts`** | Write full allocation lines; read for audit |
| **`qrPayments.ts`** | `reviewPaymentRecord()` accepts allocation; stop assuming split |
| **`rentInvoices.ts`** / **`meterElectricity.ts`** | Apply partial payments from allocation to specific invoices |
| **`checkoutSettlement.ts`** | Remove any path using required deposit in refund math; snapshot `deposit_received_paise` |
| **`refundConsole.ts`** | **Remove** fallback to `bookings.depositPaise` — if ledger empty, refund base = 0 |
| **`vacating.ts`** | On complete: call `closeUncollectedDepositDue()` |
| **`moveOutPipeline.ts`** | Link to financial workspace, not approve modal |
| **`unifiedOperationsQueue.ts`** | Financial queue items → workspace deep links |

### New service (proposed)

**`src/services/paymentAllocation.ts`**

- `buildAllocationSuggestions(bookingId, amountPaise)` — from RFE outstanding
- `validateAllocation(allocation, amountPaise)` — sum check, no over-application
- `applyAllocationInTransaction(allocation, paymentId, adminId)` — ledger + invoice writes
- `getAllocationForPayment(paymentId)` — audit read

---

## 3. Payment approval flow — audit

### Current flow (automatic)

```
Resident proof → pg_payment_records (pending)
  → OperationsPaymentReviewsPanel (read-only breakdown)
  → approveQrPaymentAction
  → splitBookingPayment() [rent first]
  → recordPaymentSuccess
  → persistApprovalAllocationAfterSuccess [audit snapshot of auto split]
```

### Target flow (admin allocation)

```
Resident proof → pending
  → Checkout & Financial Workspace OR Operations focus panel
  → Admin edits allocation grid (rent / deposit / elec / other)
  → Validate remaining = 0
  → Approve → applyAllocationInTransaction
  → Immutable allocation record
```

### Flows to update (all proof types)

| Proof kind | Current approve | Needs allocation UI |
|------------|-----------------|---------------------|
| Booking checkout (`pg_payment_record`) | Auto split | **Yes — primary** |
| Rent invoice proof | Full invoice | **Yes — partial/multi-invoice** |
| Electricity proof | Full invoice | **Yes** |
| Deposit payment link | Deposit only | Simpler — default 100% deposit |
| Stay extension | Extension total | **Yes** |
| Offline admin payment | `recordOfflinePaymentAction` | **Yes** |

### Booking partial deposit

- Keep `allowPartialDeposit` concept but decouple from “partial approve button”.
- Partial = allocation leaves `deposit_due_paise > 0` after approve — admin chooses amounts, system sets due date if needed.

---

## 4. Checkout calculations — audit

### Already correct

- `computeCheckoutRefundPreview()` — uses `depositHeldPaise` from caller (ledger).
- `checkoutSettlement.ts` approve — deductions applied to ledger; refund capped by balance after deductions.

### Must fix

| Location | Issue |
|----------|-------|
| `refundConsole.ts` L458–471 | Falls back to `bookings.depositPaise` when ledger empty |
| `residentFinancialEngine.buildDepositCategory()` | Fallback `bookingCollectedPaise = required − due` when ledger empty — can lie vs actual received |
| `todaysWorkPresentation.ts` | Labels `depositRequiredPaise` as “Deposit held” |
| `checkout_settlements.deposit_required_paise` | Display-only — ensure UI never uses for refund math |

### Add at checkout open

- Snapshot `deposit_received_paise` = ledger refundable at settlement creation.
- Show in workspace: Required / Received / Outstanding deposit + refund formula using **Received only**.

---

## 5. Refund calculations — audit

### Formula (locked — aligns with your spec + notice policy)

```
refundBase     = deposit_received (ledger refundable, NOT required)
totalDeductions = notice + electricity + damage + cleaning + custom + rent_due (if policy says so)
finalRefund    = max(0, refundBase − totalDeductions)
```

**Notice policy:** keep pro-rata 14-day (`computeNoticeDeduction`) — do not revert.

**If deductions > received:** `finalRefund = 0`; track residual debt separately if needed (admin-only).

### Services to verify in implementation

- `checkoutSettlement.ts` — `buildPreview`, `approveCheckoutSettlement`
- `depositSettlement.ts` — `settleDepositRefund`, `applyDepositDeductionsInTx`
- `vacating.ts` — `completeVacatingRequest` legacy path (gate or align)
- `depositRefundSettlementPreview.ts` — resident estimate uses ledger
- `moveOutPipeline.ts` — `computeEstimatedRefundPaise`

---

## 6. Resident screens — audit

| Screen | Path | Changes |
|--------|------|---------|
| Booking checkout pay | `/booking/[code]/pay` | Show required deposit + optional “pay partial” — **no allocation** |
| Resident payments hub | `ResidentPaymentsHub.tsx` | Required / Paid / **Outstanding** deposit consistently |
| Outstanding bills card | `ResidentOutstandingBillsCard.tsx` | Already has Required · Paid · Due — standardize copy |
| Wallet view | `ResidentWalletView.tsx` | Show **Deposit received (held)** not required |
| Vacating tab | `VacatingHome.tsx` | Deduction from notice policy; refund estimate from **received** deposit |
| Pay rent / elec forms | proof upload only | No change to upload UX |

**Resident must NOT see:** payment allocation breakdown, admin allocation history.

---

## 7. Admin screens — audit

| Screen | Path | Changes |
|--------|------|---------|
| **NEW: Checkout & Financial Workspace** | `/admin/bookings/[bookingId]/financial` | **Primary deliverable** — tabs below |
| Operations queue | `/admin/operations` | Replace “Approve move-out” → “Open financial review”; remove financial More menus over time |
| Payment review panel | `OperationsPaymentReviewsPanel.tsx` | Embed allocation editor OR redirect to workspace |
| Vacating pipeline | `/admin/vacating` | Remove inline Approve modal → link to workspace |
| Checkout settlements | `/admin/checkout-settlements/[id]` | Merge into workspace tab or redirect |
| Deposits detail | `/admin/deposits/[bookingId]` | Required / Received / Outstanding header from RFE |
| Refund console | `/admin/refunds` | Fix wallet fallback; link to workspace |
| Billing overview | `BillingOverviewPanel.tsx` | Use RFE outstanding only |
| Quick actions | admin quick-actions | Deposit estimates from received, not required |
| Assign tenant / express booking | partial deposit approval | Allocation-aware |

### Workspace tabs (proposed)

1. **Summary** — KPIs: rent/dep/elec outstanding, deposit received, refund estimate
2. **Payments** — pending proofs + allocation editor + history
3. **Rent & Electricity** — invoices with required/received/outstanding
4. **Deposit** — ledger timeline, required/received/outstanding
5. **Move-out & Notice** — vacating status, notice math (14-day pro-rata), approve/reject
6. **Checkout & Refund** — settlement wizard, deductions, payout
7. **Documents** — proofs, meter photos, KYC links
8. **Activity** — audit timeline (no notification noise)

---

## 8. APIs — audit

| API / action | Change |
|--------------|--------|
| `POST /api/payment-record/booking` | No change — resident upload only |
| `app/(admin)/admin/payments/actions.ts` | All `approve*Action` accept allocation payload |
| **NEW** `GET /api/admin/bookings/[id]/financial-snapshot` | RFE snapshot for workspace |
| **NEW** `POST /api/admin/payments/[id]/allocate` | Draft allocation (optional) |
| `reviewPaymentRecord()` in `qrPayments.ts` | Apply allocation |
| Webhook `recordPaymentSuccess` | Razorpay stays auto-allocated (exact amount match) — admin review N/A |
| Cron / automation | `syncDepositCollectionFromLedger`, `markOverdueDeposits` — respect `closed_uncollected` |

---

## 9. Reports — audit

| Report / metric | Source today | Change |
|-----------------|--------------|--------|
| Dashboard deposits collected | `financialMetricsEngine` / ledger | Already cash-flow — OK |
| PG revenue drill-down | `admin.ts` queries | Split **deposit required vs collected** in exports |
| Deposit portfolio | `depositLedgerMetrics.ts` | Add outstanding deposit aggregate |
| Operations deposit-due queue | `listOutstandingDeposits` | Exclude `closed_uncollected` + completed bookings |
| Unified invoices | `unifiedInvoices.ts` | Show received/outstanding per line |
| Financial audit / repair | `financialIntegrityAudit.ts` | Add check: required ≠ received flagged, not auto-equalized |
| WhatsApp / reminders | automation engine | Only outstanding > 0 and booking active |

---

## 10. Tests — audit

### Existing tests to update

| Test file | Why |
|-----------|-----|
| `tests/unit/paymentReviewBreakdown.test.ts` | Allocation editor output |
| `tests/unit/bookingPaymentReviewAcceptance.test.ts` | Manual allocation paths |
| `tests/unit/depositSsot.test.ts` | Required/received/outstanding helpers |
| `tests/unit/depositSummaryLedger.test.ts` | No required-as-received |
| `tests/unit/checkoutRefundPreview.test.ts` | Refund from received only |
| `tests/unit/depositRefundUnlock.test.ts` | Partial deposit scenarios |
| `tests/unit/moveOutPipeline.test.ts` | Workspace links |
| `tests/unit/refundConsoleActionability.test.ts` | Remove required fallback |
| `tests/unit/residentTimeline.test.ts` | Copy updates |

### New tests required

1. **Allocation validation** — sum = received, over-application rejected
2. **Allocation application** — rent-only, deposit-only, mixed, multi-invoice
3. **Partial deposit lifecycle** — pay 50%, pay remainder, outstanding reduces
4. **Checkout with partial received deposit** — refund from ₹2,000 not ₹4,120
5. **Post-checkout uncollected deposit** — due closed, not in pay queue
6. **Resident API snapshot** — no allocation fields exposed
7. **Integration:** proof upload → admin allocate → ledger + invoice state

### Verification scripts

- Extend `scripts/verify-financial-ssot.ts` — required ≠ received report
- New `scripts/audit-deposit-required-vs-received.ts`

---

## Implementation phases

### Phase 0 — SSOT hardening (1–2 days)

**Goal:** Stop wrong assumptions without new UI.

- Remove `refundConsole` required-deposit fallback
- Fix mislabeled admin copy (`todaysWorkPresentation`, deposit “held” labels)
- Add `deposit_received_paise` snapshot on checkout settlement create
- Add `closeUncollectedDepositDue()` on vacating/checkout complete
- Reconciliation script for active bookings
- Tests for refund-from-received-only

**Exit criteria:** No production code path uses `bookings.deposit_paise` as received/refund base.

### Phase 1 — Payment allocation engine (3–5 days)

**Goal:** Admin-controlled allocation at approve time.

- Schema: `payment_allocations` (line items) + extend audit
- `paymentAllocation.ts` service
- Allocation editor component (admin-only)
- Wire booking + rent + elec approve actions
- Suggested allocation from RFE outstanding
- Persist immutable allocation on approve

**Exit criteria:** Admin can allocate ₹2,000 deposit-only on a booking proof; resident UI unchanged.

### Phase 2 — Required / Received / Outstanding visibility (2–3 days)

**Goal:** Everyone sees the same three numbers.

- RFE snapshot API
- Resident: deposit outstanding on payments/wallet
- Admin: deposits page, resident profile, billing overview use RFE
- Documentation update in `docs/Deposits.md`

**Exit criteria:** Dhruv-style partial deposit visible to resident and admin consistently.

### Phase 3 — Checkout & Financial Workspace (5–8 days)

**Goal:** Single page for all financial decisions.

- Route: `/admin/bookings/[bookingId]/financial`
- Tabs: Summary, Payments, Rent/Elec, Deposit, Move-out, Checkout, Documents, Activity
- Move-out approve/reject lives here (not modal)
- Checkout settlement embedded or deep-linked tab
- Operations queue links here instead of vacating modal

**Exit criteria:** Approve move-out + review refund + allocate payment without leaving workspace.

### Phase 4 — Operations consolidation (2–3 days)

**Goal:** Retire old patterns.

- Operations “Approve move-out” → “Review finances”
- Remove / hide vacating inline approve modal
- Deprecate scattered More menus for financial actions
- Update `docs/ROUTES.md`, guides, notification deep links

### Phase 5 — Reports, migration, production (2–3 days)

- Backfill scripts
- Report columns
- `MASTER_TEST_MATRIX` updates
- Production verification checklist

**Total estimate:** ~15–21 dev days (can parallelize Phase 1 + 2 after Phase 0).

---

## Decisions locked (from product owner)

| Rule | Status |
|------|--------|
| Notice policy 14-day pro-rata | **Keep** — do not revert |
| Refund base = received deposit | **Implement/enforce** |
| Admin manual payment allocation | **New** |
| Resident never sees allocation | **Enforce** |
| Outstanding deposit visible to both | **Extend UI** |
| Post move-out: uncollected deposit not collectible | **New status + close flow** |
| One Checkout & Financial Workspace | **Replace** separate Move-out Review |
| No separate `/admin/vacating/[id]/review` | **Use booking-scoped workspace** |

---

## Open questions (resolve before Phase 3)

1. **Rent due at checkout:** Should unpaid rent invoices deduct from deposit automatically, or require explicit admin toggle per checkout?
2. **Overpayment:** Keep current disposition (wallet credit / future adjustment / refund later) or fold into allocation grid?
3. **Multi-booking residents:** Workspace per booking only, or resident-level rollup with booking selector?
4. **Razorpay auto-capture:** Auto-allocate using invoice match when amount exact, skip admin review?

---

## Deploy checklist (when implementation completes)

1. Run Phase 0 reconciliation script (dry-run → apply)
2. Migrate schema (allocations + `closed_uncollected`)
3. `npm test` + `npx tsx scripts/verify-financial-ssot.ts`
4. Manual QA: partial deposit booking → allocate → checkout → refund from received only
5. Update vault: `docs/DECISIONS.md`, `docs/ROUTES.md`, `MEMORY/changelog.md`

---

*Plan authored 2026-07-21. Implementation must not begin until product owner approves Phase 0 scope and open questions.*
