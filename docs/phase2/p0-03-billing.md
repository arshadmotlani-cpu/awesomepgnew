# P0-3 — Admin Billing Hub

**Route:** `/admin/revenue/billing`  
**Status:** ✅ Presentation redesign complete

---

## Target structure (Need attention tab)

| Section | Contents |
|---------|----------|
| **1. Billing summary** | Amount due · Rent collected · Pending bills · Payment status |
| **2. What to do next** | Max 5 primary actions |
| **3. Bills needing attention** | Queue table + due-soon lists + deposit bulk send |
| **4. Recent transactions** | Last 8 paid rent bills (read-only) |
| **5. Advanced tools** | CollectionsBillingTools + undo pending bills (collapsed) |

Other tabs renamed for plain language: Payment proofs · Rent bills · Electricity bills · Recent payments.

---

## Before / after action count

| Surface | Before | After |
|---------|--------|-------|
| Top stat row on every tab | 4 cards always visible | **Only on Need attention tab** (Section 1) |
| Duplicate queue stats | 4 cards in BillingOverviewPanel + 4 page cards | **Single summary** (Section 1) |
| CollectionsBillingTools | Expanded above queue (~12 links + forms) | **Advanced tools** (collapsed) |
| BillingCycleOperationsPanel | Separate panel with bulk send + lists | **Merged into Section 3** (due-soon lists) |
| Generate / undo forms | Visible in queue panel | Primary: create bills · Advanced: undo + force |
| Primary action buttons (Need attention) | 8+ scattered | **≤5 in Section 2** |
| Tab labels | Billing queue, Approval queue, etc. | Need attention, Payment proofs, etc. |

---

## Duplicates removed

- Removed duplicate 4-stat grid from `BillingOverviewPanel` (was: Needs bill / Waiting check-in / Deposit due / Invoices on rent tab).
- Removed page-level stat cards from non-billing tabs (stats only on Need attention tab).
- Removed standalone `BillingCycleOperationsPanel` — due-soon data merged into Section 3.
- Removed customer-facing `DepositRefundNotice` pattern from billing (N/A).
- Removed duplicate generate/undo block from queue panel → split between Section 2 (create) and Advanced (undo/force).

---

## Items moved to Advanced Tools

- Full `CollectionsBillingTools` (rent + electricity + deposit + historical payment guides)
- Undo pending bills for month (`cancelPendingInvoicesAction`)
- Force all bills + Mark overdue (inside CollectionsBillingTools)
- Historical payment search panel

---

## Language changes

| Before | After |
|--------|-------|
| Outstanding | Amount due |
| Generate invoice / Generate | Create bill |
| Billing queue | Bills needing attention / Need attention (tab) |
| Approval queue | Payment proofs |
| Rent invoices (tab) | Rent bills |
| Pending rent invoices | Unpaid rent bills |
| Mark overdue | Mark unpaid bills overdue |
| Check-in later | Move-in later |

---

## Business logic unchanged

- All data loaders (`getRentStats`, `listRentBillingOverview`, `listBillingCycleOperations`, etc.)
- All server actions (`generateDueInvoicesAction`, `generateInvoicesAction`, `cancelPendingInvoicesAction`, payment link generation)
- Permissions (`rent:write`, `payments:write`)
- Tab routing and query params
