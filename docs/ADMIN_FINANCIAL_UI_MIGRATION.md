# Admin financial UI migration report

**Date:** 2026-06-26  
**Goal:** One invoice-based financial source of truth. Resident profile = SSOT for operations; booking page = history after check-in.

No billing logic, invoice generation, payment approval, revenue calculations, or database schema were changed.

---

## Single source of truth

| Surface | Data service | Records |
|---------|--------------|---------|
| Resident profile `#financial` | `getResidentFinancialSummary` + `listResidentInvoiceHistory` (`unifiedInvoices`) | Rent, deposit, electricity, custom invoices |
| Billing Center | `listAdminRentInvoices`, electricity reminders, `listPendingPaymentReviews` | Same underlying invoice rows |
| Revenue | `getRevenueCommandCenterData`, entity panels via `listAdminRentInvoices` | Same invoice rows |
| Collections / Operations queues | `buildCollectionsQueue`, `listAdminRentInvoices` | Same invoice rows |
| Invoices module | `getInvoiceCommandCenterData`, `getUnifiedInvoiceDetail` | `financial_invoices` registry |
| Payment approvals | `listPendingPaymentReviews` | Proof queue tied to invoice payment flow |

**Removed as admin SSOT after check-in:** booking page `payments` ledger balance (`totalPaise − netCollected`).

---

## Resident profile changes

### New primary panel

| Widget | File | Shows |
|--------|------|-------|
| **ResidentFinancialSSOTPanel** | `src/components/admin/residents/ResidentFinancialSSOTPanel.tsx` | Current room, check-in, next rent due, deposit status, current dues, latest invoices (linked to `/admin/invoices/[id]`) |

### Removed / replaced on profile

| Removed widget | Was in | Replaced by |
|----------------|--------|-------------|
| **ResidentFinancialScheduleCard** (full schedule grid: billing cycle, rent due day, deposit required/paid/outstanding split) | `ResidentFinancialScheduleCard.tsx` | **ResidentFinancialSSOTPanel** — deposit as single status line; dues as one total |
| **Rent payment history** table (`listAdminRentInvoices` duplicate) | `residents/[customerId]/page.tsx` | **Latest invoices** in SSOT panel (`listResidentInvoiceHistory` / unified invoices — same as Invoices module) |
| Link label “Rent & electricity bills” | Stay details section | **Booking history** → `/admin/bookings/[id]` |
| Link label “Security deposit” | Stay details section | **Deposit invoice** → `/admin/deposits/[bookingId]` |

### Unchanged (still on profile)

| Widget | Role |
|--------|------|
| **ResidentInlineOpenBills** | Collect actions for open invoice line items (RFE) |
| **Resident360WorkflowBar** | Next admin step from RFE + unresolved actions |
| **ResidentProfileAdvancedTools** → **FinancialCommandCenter** | Invoice generation, category WhatsApp, express collection (advanced) |
| **EditMoveInDateForm**, **EditRentDueDateForm**, **EditTenantTenancyForm** | Tenancy edits (non-duplicate of invoice SSOT) |
| **FinalSettlementPanel** | Vacated residents only |

### Production workflows verified

- Collections / express payment: **ResidentInlineOpenBills** + **FinancialCommandCenter** (unchanged)
- Payment proof approval: **Billing Center** / **Operations payment-reviews** (unchanged)
- KYC / bed assignment: workflow bar (unchanged)
- Cron / action sync: no dependency on removed profile widgets

---

## Booking page changes

Phase detection: `src/lib/admin/bookingFinancialPhase.ts`

| Phase | When | Financial UI |
|-------|------|--------------|
| `checkout` | `pending_payment`, or confirmed without active primary reservation | Full checkout ops (ledger, balances, record payment) |
| `active` | Checked in, no checkout settlement flags | **History only** |
| `checkout_settlement` | Active stay + admin dues/refund ops fields set | **Operations checklist only** (move-out) |
| `historical` | Cancelled / completed | History only |

### Removed after check-in (`active` + `historical`)

| Removed widget | Replaced by |
|----------------|-------------|
| **Payments ledger** table | Resident profile `#financial` + Billing Center |
| **Booking total / Collected / Net collected / Still due** summary | **Current dues** on resident profile (RFE invoice outstanding) |
| **Checkout payment allocation** table | Invoice records + deposit invoice |
| **Record offline payment** form | Resident profile express collection / Billing Center |
| **Operations checklist** (`AdminBookingOpsPanel`) | Shown only in `checkout_settlement` phase; day-to-day ops on resident profile |

### New after check-in

| Widget | File | Role |
|--------|------|------|
| **BookingInvoiceHistorySection** | `src/components/admin/bookings/BookingInvoiceHistorySection.tsx` | Read-only rent + electricity invoice tables; banner links to resident profile `#financial` |

### Unchanged on booking page

| Widget | When shown |
|--------|------------|
| Status, reservations, extensions | Always |
| **Record offline extension payment** | Pending extensions (extension checkout, not monthly billing) |
| **Cancel booking** | Pre-completion |
| **Request extension** | Confirmed finite stays |
| Rent invoices table | **Checkout phase only** (pre-check-in); post-check-in uses **BookingInvoiceHistorySection** |

### Production workflows verified

| Consumer | Still works via |
|----------|-----------------|
| `verify-apg-0036-production.ts` | `getAdminBookingDetail` unchanged |
| CollectionsActionQueue booking links | Booking history + resident profile |
| Payment reviews (booking proofs) | Operations payment-reviews |
| `RecordOfflinePaymentForm` | Booking page **checkout phase only** (onboarding payment) |
| `updateBookingAdminOpsAction` | Ops panel during **checkout_settlement** |
| Admin guides “record offline payment on booking” | Valid for **pre-check-in checkout** only; post-check-in guides should point to resident profile |

---

## Duplicate concepts removed from admin UX

| Concept | Before | After |
|---------|--------|-------|
| Booking balance (`still due`) | Booking page sidebar | Not shown after check-in |
| Payments ledger as collection UI | Booking page | Invoices + resident profile |
| Separate rent history query on profile | `listAdminRentInvoices` filter | `listResidentInvoiceHistory` (unified) |
| Two financial summaries on profile | Schedule card + rent table + FCC | SSOT panel + advanced FCC |

---

## Files added

- `src/lib/admin/bookingFinancialPhase.ts`
- `src/components/admin/residents/ResidentFinancialSSOTPanel.tsx`
- `src/components/admin/bookings/BookingInvoiceHistorySection.tsx`
- `docs/ADMIN_FINANCIAL_UI_MIGRATION.md`

## Files modified

- `app/(admin)/admin/residents/[customerId]/page.tsx`
- `app/(admin)/admin/bookings/[bookingId]/page.tsx`

## Files retained (not deleted)

- `ResidentFinancialScheduleCard.tsx` — unused on profile; safe to delete in a follow-up cleanup PR
- `AdminBookingOpsPanel.tsx`, `RecordOfflinePaymentForm` — still used in checkout / settlement phases
