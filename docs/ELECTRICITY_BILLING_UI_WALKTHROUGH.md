# Electricity Billing — Admin & Resident UI Walkthrough

Companion to [ELECTRICITY_BILLING_AUDIT.md](ELECTRICITY_BILLING_AUDIT.md) sections 5–6.

Use this checklist to capture screenshots or verify each surface manually. Suggested output folder: `docs/screenshots/electricity-billing/`.

---

## Admin screens

### 1. Billing Centre — Electricity tab

| Field | Value |
|-------|-------|
| **Route** | `/admin/billing?tab=electricity` |
| **Page** | `app/(admin)/admin/billing/page.tsx` |
| **Components** | `ElectricityRoomsPendingPanel`, `ElectricityBulkSendPanel`, `InvoiceTable` |
| **Screenshot name** | `admin-billing-electricity-tab.png` |

**Shows:** Unpaid electricity invoices, rooms missing bills for selected month, WhatsApp/cash actions.

**Actions:** Generate bill, send payment links, open unified invoice.

---

### 2. Generate electricity bill (wizard)

| Field | Value |
|-------|-------|
| **Route** | `/admin/billing/electricity/generate?wizard=1&pgId=&roomId=&month=` |
| **Page** | `app/(admin)/admin/billing/electricity/generate/page.tsx` |
| **Components** | `ElectricityWizardLauncher`, `NewElectricityBillForm`, `ElectricityCheckoutReconciliationPreview` |
| **Screenshot name** | `admin-generate-electricity-wizard.png` |

**Shows:** Previous/current meter reading, rate, live units × rate preview, checkout credit preview.

---

### 3. Electricity room dashboard

| Field | Value |
|-------|-------|
| **Route** | `/admin/electricity/dashboard?month=YYYY-MM&pgId=` |
| **Page** | `app/(admin)/admin/electricity/dashboard/page.tsx` |
| **Component** | `ElectricityRoomDashboardView` |
| **Screenshot name** | `admin-electricity-dashboard.png` |

**Shows:** Per-room bill total, collected %, outstanding, collection warnings.

---

### 4. Room bill detail — operator dashboard

| Field | Value |
|-------|-------|
| **Route** | `/admin/electricity/bills/[id]` |
| **Page** | `app/(admin)/admin/electricity/bills/[id]/page.tsx` |
| **Components** | `RoomElectricityOperatorDashboard`, `RoomElectricityResidentCard` |
| **Screenshot name** | `admin-electricity-bill-operator.png` |

**Shows:** Room meter summary, **one card per resident** (check-in/out, days charged, units, amounts, invoice viewed/paid, cross-month payment history), **View as resident** button.

**Advanced details (collapsed):** `RoomElectricityAuditPanel` (reconciliation/export), ledger, calculation breakdown.

---

### 4b. Admin preview — same page residents see

| Field | Value |
|-------|-------|
| **Route** | `/admin/electricity/invoices/[invoiceId]/as-resident` |
| **Page** | `app/(admin)/admin/electricity/invoices/[invoiceId]/as-resident/page.tsx` |
| **Component** | `ResidentPayElectricityPageContent` (preview mode) |
| **Screenshot name** | `admin-electricity-as-resident.png` |

**Shows:** Identical layout to resident pay-electricity page; payment upload disabled in preview.

---

### 5. Room settlement ledger

| Field | Value |
|-------|-------|
| **Route** | `/admin/electricity/ledger?roomId=[uuid]&month=YYYY-MM` |
| **Page** | `app/(admin)/admin/electricity/ledger/page.tsx` |
| **Component** | `ElectricitySettlementLedgerPanel` |
| **Screenshot name** | `admin-electricity-ledger.png` |

**Shows:** Checkout/manual credits, resident allocations, reconciliation gap, historical contribution form.

---

### 6. Unified invoice (electricity)

| Field | Value |
|-------|-------|
| **Route** | `/admin/invoices/[financialInvoiceId]` |
| **Page** | `app/(admin)/admin/invoices/[invoiceId]/page.tsx` |
| **Components** | `InvoiceDocument`, `MarkAsPaidCashButton`, `CollectionsInvoiceLifecyclePanel` |
| **Screenshot name** | `admin-electricity-invoice-document.png` |

**Shows:** Printable invoice, PDF download, cash settlement, lifecycle history.

---

### 7. Checkout settlement electricity

| Field | Value |
|-------|-------|
| **Route** | `/admin/checkout-settlements/[id]` |
| **Component** | `CheckoutSettlementElectricitySection`, `CheckoutRoomElectricityBreakdown` |
| **Screenshot name** | `admin-checkout-electricity.png` |

**Shows:** Move-out meter reading, per-resident checkout allocation, deposit deduction.

---

## Resident screens

### 8. Payments hub — Bills due

| Field | Value |
|-------|-------|
| **Route** | `/account/profile?section=resident&tab=payments&paymentsSub=due` |
| **Component** | `ResidentPaymentsV2Hub` via `ResidentAreaSection` |
| **Screenshot name** | `resident-payments-due.png` |

**Shows:** Outstanding electricity (and rent) rows with pay links.

---

### 9. Payments hub — Invoices (paid history)

| Field | Value |
|-------|-------|
| **Route** | `/account/profile?section=resident&tab=payments&paymentsSub=invoices` |
| **Component** | `ResidentPaymentsV2Hub` |
| **Screenshot name** | `resident-payments-invoices.png` |

**Shows:** Paid electricity invoices, lifetime electricity paid total, PDF download.

---

### 10. Pay electricity bill (breakdown)

| Field | Value |
|-------|-------|
| **Route** | `/account/resident/pay-electricity/[invoiceId]` |
| **Page** | `app/(customer)/account/resident/pay-electricity/[invoiceId]/page.tsx` |
| **Components** | `ElectricityBillCalculationBreakdownPanel`, `ResidentPayElectricityClient` |
| **Screenshot name** | `resident-pay-electricity-breakdown.png` |

**Shows:** Room meter, sharing method, occupancy timeline, your share, UPI proof upload.

---

### 11. Public invoice share

| Field | Value |
|-------|-------|
| **Route** | `/i/[shareToken]` |
| **Page** | `app/i/[shareToken]/page.tsx` |
| **Screenshot name** | `resident-invoice-share.png` |

**Shows:** HTML invoice document, download PDF button.

---

## Capture script (optional)

With local dev running and admin/resident sessions:

```bash
# Example using Playwright — adapt credentials from .env.local
npx playwright screenshot http://localhost:3000/admin/billing?tab=electricity docs/screenshots/electricity-billing/admin-billing-electricity-tab.png
```

For authenticated routes, log in first or use stored session state from existing e2e helpers (`tests/e2e/hair/helpers.ts` pattern).

---

## Screen coverage matrix

| Requirement | Admin | Resident |
|-------------|-------|----------|
| View room bill | Bill detail, dashboard | Pay page breakdown |
| Resident allocation | **Audit panel**, breakdown | Pay page "your share" |
| Previous collections | Ledger, breakdown | Breakdown "already collected" |
| Outstanding balance | Billing tab queue, audit panel | Payments due tab |
| Payment history | Fragmented (no dedicated tab) | Invoices sub-tab |
| Download invoice | `/admin/invoices/[id]` | PDF API + share link |
| Dispute | — | Not available |
