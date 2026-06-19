# Awesome PG — UX Redesign Risk Report (Phase 1)

**Generated:** 2026-06-19  
**Purpose:** Document what breaks if UI is simplified incorrectly. Complements [feature-inventory.md](./feature-inventory.md).  
**Scope:** Read-only analysis — **no logic, permissions, or financial rules were changed.**

---

## 1. Executive summary

Awesome PG’s UI sits on top of **multiple layers of financial truth** (booking snapshots, live ledger, computed invoice views, unified invoice registry, display-only caps). A redesign that merges labels, collapses statuses, or recomputes amounts in components will cause **visible totals to disagree with WhatsApp links, admin reports, and PostgreSQL ledger rows**.

**Highest-risk areas:** deposits (ledger + display caps), partial deposit checkout, vacating/checkout settlement, rent invoice generation from snapshots, permission-gated destructive actions.

**Lowest-risk areas:** Marketing pages, admin guide, analytics visitors, PG gallery/listing copy.

---

## 2. Risk severity matrix

| Area | Severity if UI wrong | Likelihood during redesign | Mitigation |
|------|---------------------|----------------------------|------------|
| Deposit ledger vs display | **Critical** | High | Always read via `depositInvoices` / `loadDepositPageData`; never sum UI fields |
| Partial deposit checkout | **Critical** | Medium | Keep rent/deposit split visible; use `breakdownBookingPayment` |
| Checkout settlement | **Critical** | Medium | Do not skip resident UPI/meter steps in UI flow |
| Rent invoice amounts | **High** | High | Use `residentFinancialEngine`; never live bed price for billed rent |
| Status enum collapse | **High** | High | Keep distinct badges per layer (see §3) |
| Permission hiding only | **Medium** | Medium | Hide buttons, keep server guards |
| KYC gating | **Medium** | Low | Preserve `canCheckIn` check before move-in messaging |
| Legacy route removal | **Medium** | Medium | Keep redirects |
| Jargon replacement | **Low** | High | Label changes OK if enum mapping preserved |

---

## 3. Status & label coupling (do not collapse)

### 3.1 Deposit — four layers

| Layer | Field / source | UI mistake |
|-------|----------------|------------|
| Booking collection | `bookings.deposit_collection_status` | Showing “Paid” when status is `partial` |
| Booking due | `bookings.deposit_due_paise` | Hiding partial balance |
| Invoice view | `depositInvoices.invoiceStatus` | Mapping `held` → `settled` |
| Admin refund flag | `bookings.admin_deposit_refund_status` | Hiding “blocked” when dues exist |

**Special label:** `waived` collection status displays as **“Adjusted”** (`depositCollectionLabels.ts`) — admin correction, not resident waiver.

### 3.2 Rent / electricity invoices

| Status | Meaning | Illegal UI action if mislabeled |
|--------|---------|--------------------------------|
| `pending` | Awaiting payment | Allow cancel as if unpaid |
| `payment_in_progress` | Proof submitted | Allow duplicate pay |
| `overdue` | Past due + late fee | Show as “Pending” without fee |
| `paid` | Settled | Allow cancel |
| `cancelled` | Void | Include in revenue KPIs |

**Source:** `src/lib/billing/invoiceStateMachine.ts`

### 3.3 Vacating & checkout

| Entity | Statuses | Coupling |
|--------|----------|----------|
| `vacating_requests` | pending → approved → completed / rejected | Penalty snapshotted at submit |
| `checkout_settlements` | awaiting_resident_details → … → refund_paid | Ledger writes on approve |

**UI risk:** Removing “submit meter photo” step → server rejects approve.

### 3.4 KYC

| `customers.kyc_status` | UI must distinguish |
|------------------------|---------------------|
| `pending` + no submission | Not started |
| `pending` + submission pending | Under review |
| `approved` | Check-in allowed |
| `rejected` | Resubmit required |

Collapsing to two states breaks `KycIdentitySection` logic.

---

## 4. Financial SSOT bypass risks

### 4.1 `residentFinancialEngine.ts`

**Used by:** Resident hub, admin resident profile, invoice generation, WhatsApp templates, revenue rollups.

| If redesign… | Consequence |
|--------------|-------------|
| Recomputes rent in a React component | Mismatch with `rent_invoices` and payment links |
| Sums invoice rows manually | Wrong allocation in `invoicePayment.ts` |
| Shows live bed price for existing resident | Disagrees with `pricing_snapshot.perBed` |

### 4.2 `deposit_ledger` (append-only)

**Used by:** All deposit balances, checkout refunds, admin corrections.

| If redesign… | Consequence |
|--------------|-------------|
| Shows gross collected only | Disagrees with corrected required deposit |
| Shows all `deducted` rows as “charges” | Admin corrections appear as damage deductions |
| Edits balances in UI without server action | Impossible today — do not add client-side “fix” |

**Display caps** (`depositAdminDisplayAmounts` in `unifiedDepositView.ts`) are **admin UI only** — not ledger truth.

### 4.3 `financial_invoices` registry

Unified list at `/admin/invoices` syncs from rent/electricity sources.

| If redesign… | Consequence |
|--------------|-------------|
| Treats registry as sole SSOT | Misses deposit ledger revenue rules |
| Merges deposit into invoice list without type filter | KPI double-count |

**Rule:** `invoiceOnlyFinancials.ts` — revenue KPIs from paid invoices; deposits from ledger.

---

## 5. Booking & checkout risks

### 5.1 Snapshot immutability

| Snapshot field | Used for |
|----------------|----------|
| `pricing_snapshot.perBed[]` | Rent invoice generation |
| `pricing_snapshot.cancellationPolicy` | Cancellation refunds |
| `pricing_snapshot.dateCoupon` | Discount audit |
| `pricing_snapshot.depositCredit` | Wallet credit at pay |

**UI risk:** Showing “current price” on booking detail for confirmed stays.

### 5.2 Partial deposit

| Component | Role |
|-----------|------|
| `partialDepositCheckout.ts` | One month deposit upfront |
| `depositCollection.breakdownBookingPayment` | Rent first, then deposit |

**UI risk:** Single “Total due” without split → wrong pay amount, failed validation.

### 5.3 Payment links (`/pay/[linkId]`)

Allocation depends on link purpose (rent, electricity, deposit, combined). Generic “Pay” button must pass through existing link type — do not merge purposes without backend change.

---

## 6. Vacating / settlement risks

| Step | Service | UI must preserve |
|------|---------|------------------|
| Notice submit | `vacating.submitVacatingRequest` | 14-day policy disclosure |
| Approve | `vacating.approveVacatingRequest` | Creates checkout settlement row |
| Resident details | `submitResidentCheckoutDetails` | UPI + meter/average choice |
| Electricity | `updateCheckoutElectricitySettlement` | Manual vs average billing |
| Approve settlement | `approveCheckoutSettlement` | Writes ledger with fixed reason strings |
| Mark paid | `markCheckoutRefundPaid` | Idempotent refund row |

**Ledger reason strings** (e.g. notice shortfall, electricity share) are audit artifacts — renaming in UI without passing through settlement API orphans history.

---

## 7. Permission & security risks

| Risk | Detail |
|------|--------|
| Sidebar hides but API open | Server actions still enforce — OK if only UI hidden |
| Client-only permission check | **Never** remove `requireAdminPermission` on actions |
| `payments:override` exposed to accountants | UI must not add override button for non–super_admin |
| PG scope bypass in drill-down URLs | Direct URL access must still filter by `adminCanAccessPg` |

**Note:** Sidebar currently shows all modules to all roles — redesign should **hide**, not **weaken**, guards.

---

## 8. Duplicate-screen consolidation risks

| Proposed consolidation | Risk if done as merge (not redirect) |
|------------------------|--------------------------------------|
| Remove `/admin/deposits/collected` | Loses month-scoped billing report |
| Merge checkout into vacating page | Different permissions & settlement state machine |
| Single resident URL for all admin drills | Breaks deep links from revenue vs operations |
| Remove `/admin/invoices` | Loses unified registry cancel/refund/link actions |
| Customer alias redirects removed | Breaks bookmarks (`/account/kyc`) |

**Safe approach:** One canonical URL + redirects + unified nav labels (Phase 2–4).

---

## 9. Cron & background job coupling

| Cron | UI must not imply |
|------|-------------------|
| `generate-monthly-rent` | Invoices exist before 1st / overdue automatic |
| `markOverdueDeposits` | “Overdue” without checking `deposit_due_date` |
| `automation` | Actions auto-resolve without sync |

Redesign of overview KPIs must read same queries as cron side effects — no new client-side overdue math.

---

## 10. Testing requirements before each redesign PR

### Must pass (manual or automated)

- [ ] Booking create → pay → confirm: `deposit_ledger` collected row matches pay amount
- [ ] Partial deposit: `deposit_due_paise` > 0 until paid via link
- [ ] Admin deposit correction: list + detail show same effective amounts
- [ ] Rent invoice pay: proof → approval → status `paid`
- [ ] Vacating: submit → approve → settlement → refund paid: ledger sums to zero balance
- [ ] KYC: cannot show “check-in ready” unless `approved`
- [ ] Role without `deposits:write` cannot mutate ledger (UI hidden + action 403)

### Regression hotspots

- `ResidentAreaSection.tsx` — many conditional CTAs
- `FinancialCommandCenter` — admin resident profile
- `DepositManagementPanel.tsx` — header totals
- `BillingOverviewPanel` — tab actions

---

## 11. Safe vs unsafe redesign changes

| Safe (presentation) | Unsafe without engineering review |
|---------------------|-----------------------------------|
| Rename labels with enum mapping doc | Merge deposit statuses into one badge |
| Collapse sections / drawers | New client-side balance calculation |
| Reduce visible buttons (move to menu) | Remove server actions |
| Unified stepper copy | Change pay allocation order |
| Hide deprecated `/admin/requests` link | Delete redirect routes |
| Plain-language KYC states | Change `kyc_status` enum values |
| Mobile nav parity | Combine rent+deposit invoice line items in DB |
| Link to `/guide` | Tag ledger rows differently without migration |

---

## 12. Open questions for stakeholder approval

1. **Resident Home:** Hard limit of 3 primary CTAs — acceptable if “Pay rent” deferred to Bills tab?
2. **Admin resident profile:** Move charge generator to drawer — acceptable for power users?
3. **Deposits list:** Hide “Deductions” column when zero display deductions — or always show column?
4. **Legacy extensions:** Remove UI entirely vs keep for historical pending extensions?
5. **Sidebar permission filter:** Hide vs disable-with-tooltip for unauthorized modules?

---

## 13. Related documentation

| Doc | Role |
|-----|------|
| [feature-inventory.md](./feature-inventory.md) | Full route & workflow audit |
| [redesign-roadmap.md](./redesign-roadmap.md) | Phased plan — blocked until approval |
| [AWESOME_PG_MASTER_DOCUMENTATION_V2.md](./AWESOME_PG_MASTER_DOCUMENTATION_V2.md) | Post-v1 feature reference |
| [awesome-pg-ux-redesign-spec.md](./awesome-pg-ux-redesign-spec.md) | Prior UX spec (may diverge — inventory wins for as-built) |

---

*Phase 1 complete. Await approval before design system or page implementation.*
