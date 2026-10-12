# FYHAIR Salon Software — Real Workflow Forensic Audit

> **Date:** 2026-10-04 · **Mode:** read-only forensic extraction. No application code, schema, deploy, or commit.  
> **Authority:** Source code over documentation. Docs under `docs/product-brain/` were read as an index, then checked against code.  
> **Product name:** Salon Software. **Reference salon:** FYHAIR (For Your Hair). Code paths: `src/hair/*`, `app/(hair)/fyh/*`.  
> **Companion graph:** [`FYHAIR-REAL-WORKFLOW-GRAPH.mermaid`](./FYHAIR-REAL-WORKFLOW-GRAPH.mermaid)

Labels used below:

- **IMPLEMENTED** — UI and server path both exist and are wired
- **PARTIAL** — some of the workflow exists
- **BROKEN** — a user-visible path fails by design or stub
- **PLACEHOLDER** — screen or schema without the workflow
- **NOT IMPLEMENTED** — no writer or no UI
- **CURRENT LEGACY BEHAVIOR** — works, but differs from older docs or from a second code path
- **TO BE VERIFIED** — not proven in this pass

---

## 1. What was read

Product brain: `FYHAIR-SALON-BRAIN.md`, `FYHAIR-COMPLETE-AUDIT.md`, `FYHAIR-GRAPH-DATA.md`, `FYHAIR-SALON-BRAIN.mermaid`, `FYHAIR-CORE-PRODUCT-MODEL.md`, `TERMINOLOGY.md`, `FYTECH-MASTER-BRAIN.md` (index only).

Code authority for current behavior: Hair pages, `src/hair/actions/*`, `src/hair/domain/checkout/pipeline.ts`, `src/hair/domain/basket/*`, `src/hair/services/invoices.ts`, `src/hair/services/stock.ts`, `src/hair/services/appointments.ts`, `src/hair/lib/nav.ts`, `src/hair/lib/auth/permissionTypes.ts`, `src/workforce/permissions/library.ts` plus catalogs, `HairQuickActionsMenu.tsx`, Quick Sale components.

Every `page.tsx` under `app/(hair)/fyh` was mapped to its imported screen module or redirect target (97 files). Express Sale, checkout, appointments, inventory side effects, attribution, and RBAC route map were read in source. Individual form field lists on every settings/report page were **not** re-opened line by line; those screens are described from the page module they mount. Where a button label was not read, it is marked **TO BE VERIFIED**.

---

## 2. How the salon app is entered

| Layer | What it is |
|-------|------------|
| Host | Hair host middleware (`src/hair/lib/host.ts`) serves `/fyh/*` on the salon hosts |
| Auth | `/auth/login` — workforce session, with a legacy admin bridge |
| App shell | `app/(hair)/fyh/(app)/layout.tsx` calls `requirePagePermissionForPath` |
| Day-to-day nav | `src/hair/lib/nav.ts` |
| 9-dot menu | `HairQuickActionsMenu.tsx` — **not** a global “+ New” menu |

**9-dot Quick Actions (exact labels):**

| Item | Label | What it does |
|------|--------|----------------|
| `express_sale` | **Express Sale** — “Walk-in billing” | `router.push('/quick-sale')` |
| `advance_payment` | **Advance Payment** — “Receive customer credit” | Opens `AdvancePaymentModal` (shown only if `canReceiveAdvance`) |
| `add_expense` | **Add Expense** — “Record a new business expense” | Opens `NewExpenseModal` (shown only if `canAddGeneralExpense`) |

Sidebar item **Quick Sale** → `/quick-sale` exists but **`hidden: true`**. The visible launcher is Express Sale.

---

## 3. Surface map (A–X)

Permission in the tables is the **legacy layout** key from `pagePermissionForPath` (`src/hair/lib/auth/permissionTypes.ts`). When the session has `workforceEmployeeId`, the layout uses workforce `grantsAllowPath` **instead of** that legacy map. Action-level guards are additional.

### A. Reception / Front Desk

| Route | Screen | What the user sees / can do | Permission | Data | Side effects |
|-------|--------|-----------------------------|------------|------|----------------|
| `/dashboard` | Redirect | Sends the user to the dashboard child their role can open (`resolveDashboardChildPath`) | `page:dashboard` | session | none |
| `/dashboard/front-desk` | Front desk dashboard | `FrontDeskDashboard` fed by `services/dashboard` | `page:dashboard` | appointments / dashboard queries | read |
| `/landing` | Redirect | `resolveDefaultLandingPath` | `page:dashboard` | session | none |
| `/appointments` | Calendar | Full appointment workflow — see §5 | `page:appointments` | `fyh_appointments`, services, staff, resources | writes appointments; **Raise Sale** does not create an invoice |
| `/quick-sale` | Express Sale | Compact POS — see §4 | `page:quick_sale` | catalog, customer, basket | invoice on complete |
| `/advance-payment` | Advance payment page | `AdvancePaymentShell` — same product as the 9-dot modal | `page:billing` | customer + amount | wallet credit invoice, no sale lines |
| `/customers` | Customer list | `CustomersList` | `page:customers` | `fyh_customers` | archive/create via customer actions |
| `/customers/new` | New customer form | `CustomerCreateForm` | `page:customers` | form | inserts customer |
| `/customers/[id]` | Customer profile | `CustomerProfile` + timeline + advance | `page:customers` | customer, invoices, timeline, wallet | notes/edits via customer actions |

**Global header search:** `src/hair/actions/search.ts` / search API. Express Sale customer search is a **different** control (`FyhCustomerSearch`), not the header search.

### B. Customers

**IMPLEMENTED.** List, create page, profile.

- Profile shows visit stats including **Points** from `fyh_customers.reward_points`. No application writer of `reward_points` was found under `src/hair` (schema default `0`, plus read in loyalty report). **CURRENT LEGACY BEHAVIOR:** points display exists; earn/burn does not.
- Outstanding shown on the profile comes from the financial summary (ledger receivables), not from adding old dues into a new Express Sale total.
- Deletion in the product is archive (`is_active`), not a hard delete in the UI.

### C. Appointments

**IMPLEMENTED.** See §5. Calendar views: day, week, timeline, chair, stylist. Create modal, detail drawer, edit drawer. Button that starts billing is labeled **Raise Sale**.

### D. Express Sale / POS

**IMPLEMENTED** as compact POS. See §4. Route `/quick-sale`. Not in the visible sidebar.

### E. Billing / Invoices

| Route | Screen | Behavior |
|-------|--------|----------|
| `/billing` | Redirect | → `/billing/invoices` |
| `/billing/invoices` | Invoice register | `InvoiceRegisterUi` + `invoiceRegisterQueries`. Default query redirects to today’s `from`/`to` if missing |
| `/billing/[invoiceId]` | Invoice detail | `BillingUi` + `InternalInvoiceActions`. Settlement display uses `summarizeInvoiceSettlement` |

**User can:** open an invoice, record further payments (`recordInvoicePayments` / pay action), print, correct or cancel (`invoiceLifecycle` / `InvoiceBillCorrectionDialog` also reachable from the Express Sale success dialog).

**Gift card:** payment method exists in `FYH_PAYMENT_METHODS` and the register labels it, but `recordInvoicePayments` throws **`Gift card payments are not available yet`**. **BROKEN** if that method is offered on the register pay form.

**Display status is not the write SSOT.** `summarizeInvoiceSettlement` only describes paid / due for the UI.

### F. Payments

There is no separate “payments” product screen. Payments are recorded:

1. Inside Express Sale (`fyh_invoice_payments` during `checkoutFromBasket`)
2. On an existing invoice (`recordInvoicePayments` in `services/invoices.ts`)
3. As customer **advance** (wallet credit, `source = 'advance_payment'`, no sale lines)
4. As vendor payments on the vendor ledger (different domain — see K)

Express Sale methods the cashier can tap: **Cash, UPI, Card**. Wallet is **Use credit**, stored as method `wallet`. Schema also allows `bank` and `gift_card`; those are **not** chips on the compact POS.

Report: `/reports/finance/payments`.

### G. Services

| Route | Screen |
|-------|--------|
| `/services` | `ServicesUi` catalog |
| `/services/new` | same UI, create |
| `/services/[id]` | same UI, edit |

**IMPLEMENTED** configuration. A service row stores selling price, GST bps, duration, commission override fields, and optional consumable kit (`fyh_service_consumables`, flag `deduct_inventory`). Booking and Express Sale copy a **snapshot** of name/price/GST at the moment the line is added; later catalog edits do not rewrite old invoices.

Service mutations in `src/hair/actions/services.ts` were observed to use `requireHairAuth` rather than a dedicated `page:services` check. **CURRENT LEGACY BEHAVIOR.** Layout still requires `page:services` to open the pages.

### H. Products

| Route | Screen |
|-------|--------|
| `/products` | `ProductsUi` |
| `/products/new` | redirect → `/products?add=1` |
| `/products/[id]` | redirect → `/products?edit={id}` |

Layout permission for `/products` is **`page:settings`** (same prefix rule as settings), not `page:inventory`.

Product types in code: `retail` and `professional` (`src/hair/lib/productTypes.ts`). That type is **not** the gate for stock deduction. Any invoice line with `kind === 'product'` deducts stock on full payment.

### I. Inventory

| Route | Screen | Status |
|-------|--------|--------|
| `/inventory` | redirect → `/inventory/stock` | |
| `/inventory/stock` | stock list from `services/stock` | **IMPLEMENTED** read |
| `/inventory/movements` | `MovementsUi` ledger | **IMPLEMENTED** read |
| `/inventory/adjustments`, `/adjustments/new` | `AdjustmentsUi` | **IMPLEMENTED** write via `applyMovement` type `adjustment`. UI copy: damage/shrinkage is a manual adjustment. There is **no** `damage` movement type |
| `/inventory/on-floor` | table of `listOpenFloorIssues` | **PARTIAL** — read-only. Copy says issue/return is Phase 2. Floor issues do **not** call `applyMovement` |
| `/inventory/transfers` | heading “Not available yet” | **PLACEHOLDER** — no form, no movement |
| `/inventory/purchases*` | legacy PO / GRN `PurchasesUi` | **IMPLEMENTED** but duplicate of `/purchases` |
| `/inventory/vendors*` | redirects to `/vendors` | alias |

Canonical stock mutation: **`applyMovement`** (`src/hair/services/stock.ts`). It updates `fyh_products.stock_qty` and inserts `fyh_stock_movements`. Negative stock is allowed only when inventory settings say so.

### J. Purchases

| Route | Screen |
|-------|--------|
| `/purchases`, `/new`, `/[id]`, `/[id]/edit` | ERP `PurchasesUi` + `purchaseBrain` |

**IMPLEMENTED.** Posting a purchase calls `applyMovement` with type `purchase`. A second, older path lives at `/inventory/purchases` (GRN in `services/purchases.ts`) and also writes type `purchase`. **CURRENT LEGACY BEHAVIOR:** two purchase UIs.

Purchase returns: `purchaseReturnEngine` writes movement type `return` with a **negative** quantity (stock leaves). **TO BE VERIFIED:** which screen button the receptionist uses to start a return (engine exists; the exact button label was not re-read).

### K. Vendors

| Route | Screen |
|-------|--------|
| `/vendors` | `VendorsUi` (inventory vendors list) |
| `/vendors/new`, `/vendors/[id]/edit` | same family |
| `/vendors/[id]` | `VendorLedgerUi` + `vendorBrain` / `purchaseBrain` |

**IMPLEMENTED** vendor master and vendor ledger/payments. Permission: `page:inventory` (path prefix `/vendors`). This is **supplier** money, not the customer wallet.

### L. Expenses

| Route | Screen |
|-------|--------|
| `/expenses` | `ExpensesUi` + section sub-nav |
| `/expenses/salary` | workforce salary cards; redirects to `/expenses` if workforce engine is off |

9-dot **Add Expense** opens `NewExpenseModal` without leaving the current page. Permission for the pages: `page:expenses`. Salary is workforce payroll, not a salon invoice.

### M. Staff / Workforce

| Route | Screen | Notes |
|-------|--------|-------|
| `/staff` | `StaffUi` + workforce `StaffManagementList` | layout permission is only `page:staff`; tighter checks live in staff actions |
| `/staff/[employeeId]` | workforce `EmployeeProfilePanel` | payroll, incentives, week off |
| `/staff/[id]/performance` | per-staff performance | may redirect to workforce employee id |
| `/staff/performance` | redirect → `/dashboard/staff-performance` | |
| `/workforce` | redirect → `/staff` | |
| `/workforce/home` | role home | requires workforce engine + employee |
| `/workforce/operations` | operations dashboard | managers; staff redirected toward `/me` |
| `/team`, `/team/[memberId]` | **Platform** org membership invites | not `fyh_staff` |
| `/me` | employee self portal | outside `(app)` layout group |

**Two staff identities:**

- `fyh_staff` — the person selectable on appointments and invoice lines
- `wf_employees` — the login / attendance / payroll person

They are linked, not the same row.

### N. Attendance

| Route | Screen |
|-------|--------|
| `/attendance` | self photo attendance + month calendar. Super admin and team viewers are redirected to manage |
| `/attendance/manage` | team calendar. Hidden from main nav (`hidden: true`) but linked from attendance |
| `/attendance/map` | geolocation evidence |
| `/settings/attendance` | office location form |

All require the workforce engine flag or they redirect away. Layout permission for `/attendance` and `/me` is `page:appointments` (**CURRENT LEGACY BEHAVIOR** — attendance is gated by the appointments page key at layout level, then by workforce grants inside the page).

### O. Loyalty

`/loyalty` mounts `LoyaltyForms`, `CommissionRows`, and `NotificationOutboxPanel`. Layout permission: **`page:customers`** (not its own page key).

**PARTIAL.** Customer `reward_points` is displayed and reported. No earn or burn writer was found. Notification outbox can be listed; delivery is a stub (see T).

### P. Memberships

`/memberships` — `MembershipsUi` + `loyaltyOps`. **IMPLEMENTED** as configuration (plans). Selling a membership is an Express Sale catalog line (`kind = membership`). On **full payment** of a `quick_sale` invoice, `applyPaidSideEffects` calls `sellMembershipWithDb`. An active membership’s `discount_bps` is applied automatically in `computeRedemptions` (first active unexpired membership, `limit 1`). There is no “pick a membership” control on the bill.

### Q. Packages

| Route | Screen |
|-------|--------|
| `/packages` | `PackagesUi` |
| `/membership-packages` | redirect → `/packages` |

**IMPLEMENTED** plan configuration. At Express Sale:

- Adding a **package plan** charges the plan price and, when the invoice is fully paid and `source = quick_sale`, `sellPackageWithDb` creates the customer package and credits.
- **Available Services** on the sale step adds **prepaid redemption** lines at ₹0. Those credits are burned by `redeemPackageCredits` inside the checkout transaction when the invoice is paid (including ₹0 totals).
- A second, older auto-discount path still exists in `computeRedemptions` (one session valued as plan price / sessions) when the basket has **no** explicit prepaid lines. **CURRENT LEGACY BEHAVIOR.**

Package **purchase** lines do not get staff attribution. Prepaid redemption lines require a staff member and are attributed `serviced_by`.

### R. Reports

Hub `/reports` plus:

- Revenue: `/reports/revenue/daily|monthly|yearly` — `services/reports`
- Staff: `/reports/staff/[metric]` — `staffPerformance` (reads **attributions**)
- Inventory: products, stock, low-stock — `services/stock`
- Customers: loyalty, memberships, packages — `reportQueries`
- Finance: GST, payments, discounts — `reportQueries`

Permission: `page:reports`. Export action key: `action:reports.export`. Staff performance command center is a dashboard, not this folder: `/dashboard/staff-performance`.

### S. Dashboard

| Route | Screen | Permission |
|-------|--------|------------|
| `/dashboard/revenue` | `RevenueDashboard` | `page:dashboard_revenue` |
| `/dashboard/staff-performance` | `StaffPerformanceCommandCenter` | `page:dashboard_staff` |
| `/dashboard/front-desk` | `FrontDeskDashboard` | `page:dashboard` |

Revenue widgets read paid invoices and attribution metrics. Gift-card revenue is summed from `gift_card_redemption_paise`, which checkout currently writes as **0**.

### T. Notifications

Schema: `fyh_notification_templates`, `fyh_notification_outbox`. After checkout, `enqueuePostCheckoutNotifications` runs **outside** the invoice transaction and failures are swallowed. Processing is a manual/stub batch, not a Hair cron. **PARTIAL.** WhatsApp settings page exists (`/settings/whatsapp`); a live send adapter was not confirmed as wired. **TO BE VERIFIED** against `src/hair/services/notifications.ts` before claiming any message actually leaves the building.

There is **no** Hair route under `app/api/cron`.

### U. Settings / configuration

`/settings` redirects to `/settings/salon`. Permission: `page:settings` (also covers `/products`).

| Route | Form module | What it configures |
|-------|-------------|--------------------|
| `/settings/salon` | `SalonSettingsForm` + `ResourcesPanel` | salon identity, hours, chairs/resources |
| `/settings/billing` | `BillingSettingsForm` | billing defaults used as Express Sale flag defaults (`markDue`, `markFullDue`, `creditOverpayAsAdvance`) |
| `/settings/gst-invoice` | `GstInvoiceSettingsForm` | GST invoice identity |
| `/settings/printer` | `PrinterSettingsForm` | receipt/printer |
| `/settings/inventory` | `InventorySettingsForm` | includes allow-negative stock used by `applyMovement` |
| `/settings/appearance` | `AppearanceSettingsPanel` | appearance |
| `/settings/communication` | `CommunicationSettingsForm` | communication defaults |
| `/settings/whatsapp` | `WhatsappSettingsForm` | WhatsApp settings |
| `/settings/security` | `SecuritySettingsPanel` | security |
| `/settings/permissions` | workforce `PermissionManagementPanel` | workforce grants |
| `/settings/attendance` | office location | geo fence for attendance |
| `/settings/historical-import` | `HistoricalImportPanel` | super-admin historical sales import (`action:import.historical`) |

Invoice numbers (flag off): `nextInvoiceNumber` increments `fyh_settings.invoice_next_seq` and returns `{invoice_prefix or FYH}-{seq padded to 5}`. Example shape: `FYH-00042`. When `FYH_SAAS_TENANT=1`, numbers come from `fyh_org_invoice_sequences` as `{prefix or INV}-{seq}`. Hold drafts use a separate number `HOLD-` + 8 hex chars (`quickSaleHold.ts`) until checkout replaces the invoice number.

### V. Public / customer-facing

| Route | Auth | Behavior |
|-------|------|----------|
| `/i/[invoiceNumber]` | none | `PublicFyhInvoice` |
| `/invoice/[invoiceNumber]` | none | redirect to `/i/{number}` |
| `/salon-software` | none | marketing + waitlist |
| `/subscribe` | flag | redirects away unless SaaS tenant flag is on |
| `/brand-concepts` | none | brand page |
| `/system-map` | none on this route group | internal architecture explorer (noindex). Not a salon operator screen |

Public lookup is by invoice number / token as implemented in the public invoice service. Older audits flag cross-tenant risk if invoice numbers are unique per org but the public lookup is not org-scoped (**ISS-02**). This pass did not re-prove the SQL. **TO BE VERIFIED** before changing that page.

### W. Platform / SaaS administration

Separate app and **separate database**: `/platform/admin/*` (overview, organizations, locations, users, subscriptions, plans, payment submissions, onboarding, activity, search), invite accept, Stripe webhook. Not used by the receptionist to bill a haircut. `/team` inside the salon app edits **platform memberships** for the org.

### X. Authentication

| Route | Behavior |
|-------|----------|
| `/auth/login` | login; if already in a session, redirects into the app or org picker |
| `/select-organization` | org picker when SaaS tenant mode is on; otherwise redirects toward the dashboard |
| Forgot password | **BROKEN** — placeholder on the login screen (prior UAT-M14; not re-tested in a browser this pass) |
| `/access-denied` | shown when a page permission fails. Exempt from the permission map |

---

## 4. Express Sale — complete current behavior

**UI name:** Quick Actions → **Express Sale**. **URL:** `/quick-sale`. **Component:** `QuickSaleShell`. **Page loader:** `app/(hair)/fyh/(app)/quick-sale/page.tsx`.

On load the server prefetches:

- `loadBillableCatalog` — services, products, packages, memberships
- `getSalonSettings` — billing defaults
- If `?appointmentId=` is present: `loadAppointmentCheckoutPrefill`

### 4.1 Opening the screen

1. 9-dot **Express Sale** → `/quick-sale` with no query.
2. Direct URL `/quick-sale`.
3. Appointment **Raise Sale** → `/quick-sale?appointmentId={id}` only. The basket is **not** passed in the query string. The page rebuilds it on the server.

Hidden nav link “Quick Sale” goes to the same page.

### 4.2 Before a customer is selected (`step === 'customer'`)

Visible:

- Eyebrow **Quick Sale**, heading **Find customer**
- Search box, placeholder **Search name / phone / customer code**, auto-focused
- **+** button, aria-label **Create new customer**
- If draft holds exist: **Held bills** table (customer name, total). Clicking the name resumes that hold
- Optional error if the appointment id could not be loaded

Not visible yet: catalog, basket, payments, Complete Sale.

If the URL has a valid appointment prefill, this step is **skipped**. The screen opens on the sale step with the appointment customer and lines.

### 4.3 Customer search

Component: `FyhCustomerSearch` with `createContext="quick_sale"`.

| Rule | Current behavior |
|------|------------------|
| Debounce | 150ms |
| Minimum length | **1** trimmed character |
| Server function | `searchCustomersForBookingAction` → `searchCustomersForPos` |
| Match | `ilike` on full name, phone, and customer code; also digit-stripped phone via `regexp_replace` |
| Who is returned | `is_active = true`, org filter, limit 30 |
| Result row | name; second line phone, customer code if present, and **Credit ₹…** if `walletBalancePaise > 0` |
| Empty | phone-like query (≥6 digits): “No customer found”; otherwise “No customers found” plus Add customer |

**Permission on this search:** any of `page:appointments`, `page:quick_sale`, `page:billing`, `page:customers`.

**CURRENT LEGACY BEHAVIOR:** `searchCustomersForPosAction` (workforce key `quick_sale.customer.search`) exists and is **not** what this screen calls.

Selecting a row sets the customer, clears any hold id, and moves to `step = 'sale'`.

### 4.4 After an existing customer is selected — what appears automatically

Header (`QuickSaleCustomerHeader`): **name, customer code, phone**.

Async customer context:

- Last visit (opens visit history)
- Count of package services still available
- Advance / wallet balance
- Due / outstanding on **other** invoices

The due amount is shown on the checkout bar as customer outstanding with the meaning **not included in this invoice total**. The system does **not** add old dues into the new bill.

Also automatic:

- Billing flags copied from salon billing settings
- If this sale came from an appointment: lines and staff already filled (see §5)
- Membership discount preview (`previewQuickSaleTotalsAction`, about 250ms debounce) writes `membershipDiscountPaise`. No extra field for the receptionist
- Payment amount box prefills the amount still to allocate

### 4.5 What the receptionist still enters

- Which services/products/packages/memberships to add
- Quantity (except prepaid lines, which lock quantity)
- Optional line price and discount percent
- Staff on every **service** line and every **prepaid redemption** line
- Optional extra staff (equal split)
- Package redemption via **Available Services**, if they choose to
- How the customer is paying
- Whether to mark a remainder as due, or an overpay as advance

### 4.6 Customer does not exist — Add client

The empty state and the **+** button open `FyhCustomerCreateModal`.

| Field | Required |
|-------|----------|
| Mobile (`phone`) | yes |
| Full name | yes |
| Gender | no — default **female** (female / male / other / prefer not to say) |
| Email | no |
| Date of birth | no |
| Notes | no |

Button: **Save customer**.

Save function: `createSalonCustomerFromForm`.

- Phone + name only → `createCustomerQuick`, `source: 'walk_in'`, timeline text includes created via Quick Sale
- If email, DOB, or notes is filled → full `createCustomer` with `forceCreate: true`, still `source: 'walk_in'`

The customer row is **inserted immediately**, before any invoice. `onCreated` returns the new customer with wallet `0` and selects them into the sale step. They are then a normal searchable customer.

Create permission: `page:quick_sale` OR `page:appointments` OR `page:customers`.

If the search text looks like a phone, the modal prefills phone. If it looks like a customer code, it prefills name. Otherwise it prefills name.

### 4.7 Services and products search

The catalog is loaded **once** with the page. Typing filters that list in the browser (`matchesBillable`). It does **not** call the server per keystroke.

Matches name, code, category, an exact rupee price, and token-AND on the haystack. At most **10** rows. Pressing **`/`** focuses the search when the user is not already in an input.

Types in the list: **service, product, package, membership**.

Click or Enter adds the row via `basketLineFromBillableItem`: quantity 1, catalog price, catalog GST, no staff yet, no discount. Search clears and focus returns to the box.

An older tabbed `QuickSaleCatalogPanel` still exists in the repo and is **not mounted**.

### 4.8 Quantity

Minus / plus on the basket row. Prepaid redemption quantity is fixed by the credit the receptionist chose in the package modal.

### 4.9 Staff

`QuickSaleStaffRow` shows a staff picker on **service and product** lines. Package and membership purchase lines show an em dash.

The screen does **not** label the picker “Serviced by” or “Sold by”. The role is decided later in `buildAttributionPlan`:

| Line | Attribution role | Staff required to complete sale? |
|------|------------------|----------------------------------|
| Service with `staffMode === 'SERVICE'` (normal services) | `serviced_by` | **yes** |
| Prepaid package redemption | `serviced_by` | **yes** |
| Product | `sold_by` | **no** (picker is optional) |
| Package purchase | none — line skipped | **no** |
| Membership purchase | `sold_by` if a seller is present | **no** |

Several staff can be attached to one line. Shares are equalized to 10,000 bps (`normalizeEqualShares`); leftover bps go to the first person. **Different lines can have different staff.**

Checkout copy if a required line has no staff: title **Cannot complete sale**, then the line names.

Appointment prefill puts the **appointment’s single `staffId`** on every service line at 100%. Per-service staff typed in the create-appointment notes is **not** a separate database staff id.

### 4.10 Prices

Price is the catalog snapshot at the moment the line is added (`unitSellingPricePaise`, `gstBps`). Products use the salon product GST constant in the catalog adapter. Services use the GST stored on the service (product brain: default 18% / 1800 bps — confirm on the service row, not as a per-bill tax code).

The receptionist can change the line **Price** (`lineGrossOverridePaise`) and a **discount percent** 0–100 (`overridePricePaise`). Final column is display-only.

There is no separate invoice-level discount field on the compact bar. The **Discount** row is line discounts plus the automatic membership discount.

### 4.11 Membership pricing

`computeRedemptions` (`services/invoices.ts`):

- Finds one active customer membership whose `expires_on` is today or later
- Discount = `round(discountSubtotal * plan.discountBps / 10000)`
- Discount subtotal is service and product lines, excluding prepaid redemption lines, after line overrides

`completeQuickSaleAction` calls `enrichBasketWithRedemptions`, and `checkoutFromBasket` calls it **again**. **CURRENT BEHAVIOR:** the server recomputes the discount at save time. The preview on screen uses `previewQuickSaleTotalsAction` so the bar can match, but the saved discount is the checkout recompute.

### 4.12 Package pricing

- **Buying a package:** catalog price of the plan. Invoice line name is rewritten with included services, normal value, offer price, and validity (`formatPackagePurchaseInvoiceName`).
- **Using a package:** **Available Services** modal. Each chosen credit becomes a basket line with final ₹0, GST 0, and metadata “Package Redemption · Prepaid · {package name}”. On a paid (or ₹0) invoice, `redeemPackageCredits` runs inside the same transaction, idempotency key `redeem:{invoiceId}:{creditId}`.
- **Legacy auto path:** if there is no explicit prepaid line, `computeRedemptions` may set `packageRedemptionPaise` to one session’s average value and later burn one credit in `applyPaidSideEffects`. Do not describe this as the receptionist’s normal control. The normal control is **Available Services**.

### 4.13 Loyalty

**NOT IMPLEMENTED** on this screen. No points earn, no points burn, no points payment method. Wallet credit is a payment method, not loyalty points.

### 4.14 GST

`priceBasket` uses GST-inclusive math (`domain/basket/gstInclusiveMath.ts`). Checkout bar:

- **Subtotal** = `subtotalBasePaise` (base before GST display)
- **Discount** = line discounts + membership discount, shown only if &gt; 0
- **GST** = `taxPaise`
- **TOTAL** = `grandTotalPaise`

Tip and round-off are written as **0** in `checkoutFromBasket`. Gift card redemption is written as **0**.

### 4.15 Advance already on the customer

Header shows **Advance**. Payment panel says **Customer credit** and **Use credit**. That adds a payment row with method `wallet`, capped by the remaining total. `checkoutFromBasket` rejects the sale if wallet payments exceed `fyh_customers.wallet_balance_paise` (“Insufficient customer credit”).

The advance itself is created earlier by Advance Payment (9-dot or `/advance-payment`), which posts a ledger credit and refreshes the wallet cache. It does not create sale lines.

If the cashier takes **more** than the total and ticks **Advance ₹…** (`creditOverpayAsAdvance`), the extra is `creditWalletAdvance` (“Overpay on {invoice number}”).

### 4.16 Payment methods, split, partial, credit

| Control | Behavior |
|---------|----------|
| Cash / UPI / Card | one method row |
| **Split** | more than one row; **+ Add Payment** |
| **Use credit** | wallet row |
| **Mark ₹… as Due** | sets `flags.markDue`. Allowed when paid sum is less than total. Invoice status `partial` if some money was taken, `unpaid` if the flag is full-due and pay sum is 0 (`markFullDue`) |
| Zero total | copy **Package redemption — no payment required**. Status becomes `paid` because grand total is 0 |
| Complete Sale | calls checkout. Label **Processing…** while in flight |

Payments are applied in order and **capped at the grand total**. Extra cash is not stored as a payment row beyond the total; it becomes wallet advance only when the overpay flag is set.

**Prior outstanding is not collected on this invoice.** A new due is only the unpaid part of **this** bill, and only if Mark as Due / full due was set. `receivablePaise` returned to the UI is 0 unless one of those flags is set.

### 4.17 Canonical billing function — every step

**Function:** `checkoutFromBasket` in `src/hair/domain/checkout/pipeline.ts`.  
**Caller for Express Sale:** `completeQuickSaleAction` (`src/hair/actions/quickSale.ts`), permission `quick_sale.sale.complete`.

```text
QuickSaleShell.submitCheckout
  → completeQuickSaleAction
       → enrichBasketWithRedemptions
       → checkoutFromBasket
            → enrichBasketWithRedemptions again
            → priceBasket
            → validate lines + payments
            → DB transaction
            → if paid or total 0: redeem explicit package credits + applyPaidSideEffects
  → best-effort notification enqueue
  → best-effort owner-os “invoice paid” event if any money was applied
  → QuickSaleSuccessDialog
```

Inside the transaction, in order:

1. Reject the basket if line validation fails (`collectBasketLineValidationErrors`).
2. Require `appointmentId` when `source === 'appointment'`.
3. Recompute membership/package redemption fields.
4. `priceBasket` → line totals, attribution plan, ledger plan, grand total.
5. Sum payments. `validateCheckoutPayments` (mark due / full due / allow unpaid).
6. Load the customer. Reject if missing. Reject if wallet payments exceed cached wallet balance.
7. If a hold id was passed: the draft must be `status = draft` in this org/location. Delete its old lines, attributions, and payments. The hold row is then **updated**, not inserted.
8. Allocate an invoice number (`nextInvoiceNumberForTx`) even when finishing a hold (the HOLD-* number is replaced).
9. Decide status:
   - total 0 → `paid`
   - payments cover total → `paid`
   - full due and nothing paid → `unpaid`
   - mark due and a partial payment → `partial`
   - some payment but not flagged in the branches above → `partial`
   - otherwise → `unpaid`
10. Insert or update `fyh_invoices` with `source` `quick_sale` or `appointment`, stylist = first line’s primary staff, amounts from `priceBasket`, `paid_at` set only when status is `paid`.
11. Insert `fyh_invoice_lines` (package and redemption names rewritten).
12. Insert `fyh_invoice_line_attributions` from the priced plan. Package purchase lines have none.
13. Insert `fyh_invoice_payments` up to the total. Method reference is null.
14. `postLedgerEntries` from `priced.ledgerPlan` into `fyh_financial_ledger`.
15. Overpay + flag → `creditWalletAdvance`; else `reconcileCustomerWalletCache`.
16. Insert `fyh_customer_timeline` event type `bill`. Title `Quick Sale · {number}` or `Appointment · {number}`.
17. If appointment source: set `fyh_appointments.invoice_id` and status `paid` when the invoice is paid or total is 0, otherwise `completed`.
18. If status is `paid` or total is 0:
    - burn explicit prepaid credits
    - `applyPaidSideEffects`

`applyPaidSideEffects` (`services/invoices.ts`) returns immediately for `historical_import` and `advance_payment`.

For a normal sale it:

- Skips `syncInvoiceLineAttributions` when source is `quick_sale` (rows were already inserted in step 12). Other sources get a sync.
- Increments customer `total_visits`, `lifetime_spend_paise`, recomputes `average_bill_paise`, sets `last_visit_at`, and subtracts `wallet_redemption_paise` from the **cached** wallet (ledger remains the wallet SSOT; cache is also reconciled earlier).
- Increments service `total_bookings`, `revenue_generated_paise`, `last_booked_at`.
- `evaluateCommissionsForInvoice` (rules → `fyh_commission_entries`, status pending).
- `applyLegacyCommissionFallback` for **service** lines that still have **no** attribution row (uses line staff or invoice stylist, service override or staff default percent/fixed).
- `applyInventorySideEffects` for **both** quick sale and non-quick-sale (the two branches both call it).
- If quick sale: `sellMembershipWithDb` / `sellPackageWithDb` for those line kinds.
- If the invoice has `appointment_id`: force appointment status to `paid`.
- Legacy package credit burn if `packageRedemptionPaise > 0` and a package id was passed.

**Inventory runs only on this full-pay path.** A partial or unpaid invoice does **not** deduct stock, does **not** sell the membership/package, and does **not** run commission. Stock moves later if a follow-up payment makes the invoice fully paid (`recordInvoicePayments` calls `applyPaidSideEffects` only when `paid && wasUnpaid`).

### 4.18 Invoice numbering, ledger, history, reports

- Number: §U. Not a random id. Public token is a separate column `public_access_token`.
- Ledger: customer advance, receivable open, payment received, wallet redemption — plan built inside `priceBasket` / ledger module, posted in the same transaction.
- History: timeline bill event at checkout. Customer stats update only when the invoice is fully paid (or ₹0).
- Reports and staff dashboards read **`fyh_invoice_line_attributions`** on paid invoices, not a second performance table.

### 4.19 After a successful checkout

`step` becomes `done`. `QuickSaleSuccessDialog` loads `getQuickSaleInvoicePreviewAction` (`quick_sale.access`).

Toolbar:

- **Print**
- **Download PDF** — public print URL from the token (this is not a separate “copy link” button)
- **WhatsApp** — opens a message that includes `invoicePublicViewUrl`
- **Google Review** — only if salon settings have `googleReviewUrl`
- **Open Invoice** — `/billing/{invoiceId}`
- **Edit bill** / **Cancel bill** — `InvoiceBillCorrectionDialog`
- **Done** (also Close and Escape) — clears the session and returns to **Find customer**

### 4.20 If checkout fails

`completeQuickSaleAction` catches errors and returns `{ error: message }`. The bar shows that string. Nothing in the failed transaction is committed (database transaction rolls back). Session storage is reverted from the checkout-pending key so the basket can be retried.

Messages from `quickSaleLifecycle.ts`:

- A previous checkout may not have finished
- Sale could not be completed. Nothing was charged or saved
- Checkout did not complete. Verify Billing before retrying

**CURRENT BEHAVIOR:** notification enqueue and the owner-os event run **after** commit. If those fail, the invoice still exists. If the browser dies after commit but before the success dialog, the pending localStorage key tells the user to check Billing.

### 4.21 Hold, cancel, source tags

| Topic | Current behavior |
|-------|------------------|
| Create hold | `holdQuickSaleAction` → `saveQuickSaleHold` writes a **draft** invoice, `source = quick_sale`, number `HOLD-…`. Permission `quick_sale.sale.hold` |
| Hold button on screen | **Not mounted.** `submitHoldBill` exists in `QuickSaleShell` and is not referenced by JSX. The **Hold Bill** button lives only in unused `QuickSaleCheckoutColumn`. Tests assert the compact shell does not mount that column |
| Resume hold | **IMPLEMENTED** on the customer step via `loadQuickSaleHoldAction` (`quick_sale.sale.resume`) |
| Cancel sale / Clear all | in-progress basket controls on the sale step (client state). They do not void a completed invoice |
| Void / correct a finished bill | success dialog → invoice lifecycle (cancel/correction). **TO BE VERIFIED:** exact reversal of stock and commission on cancel — `invoiceCancellation.ts` exists; this pass did not re-read every reversal branch |
| Source tags | completed walk-in `quick_sale`; appointment prefill `appointment`; new customer `walk_in`; hold draft `quick_sale` + `HOLD-` number |
| Local draft | `sessionStorage` key `fyh-quick-sale-session-v1`, saved about every 300ms while the sale step is active. Checkout pending uses `localStorage` `fyh-quick-sale-checkout-pending-v1` |

### 4.22 What Express Sale does not do

- It does not create an appointment row for a pure walk-in sale
- It does not pull old dues into the new total
- It does not earn loyalty points
- It does not accept gift cards
- It does not show Bank as a method chip
- It does not deduct inventory until the invoice is fully paid
- It does not let the receptionist type a new hold from the compact screen

---

## 5. Appointment workflow

### 5.1 Create

`AppointmentCreateModal` → `createAppointmentAction` → `createAppointment`.

| Field | Required |
|-------|----------|
| Customer | yes |
| One or more services | yes |
| One staff member (`staffId` on the appointment) | yes |
| Start time | yes — comes from clicking a slot. Opening “New appointment” without a slot submits no `startAt` and the server returns **Invalid start time** |
| Status | optional. UI offers booked, confirmed, arrived. Server default `booked`, or `arrived` if Walk-in is checked |
| Source | `walk_in` only when the Walk-in box is checked; otherwise `booking` |
| Notes | optional. “Consulted by” and per-service staff text can be stored here as **text only** |
| Recurrence weeks | optional, clamped 1–12. Later weeks are skipped if they conflict |
| Resource / chair | **not sent** by the current create modal. Edit drawer can set `resourceId` |

New customer during booking uses the same modal as Express Sale with `createContext="appointment_booking"`. The customer is saved first. The appointment is not created until the booking form is submitted.

Server checks: services must be active and bookable; salon hours; staff working hours (workforce day hours if present, else `fyh_staff_schedules`); no overlap on that staff among statuses that still occupy the chair. Occupying statuses exclude `cancelled`, `no_show`, `completed`, `paid`. If a resource is set, the same overlap check runs for the resource. `assertStaffCanPerform` is a **no-op**.

### 5.2 States

Enum: `booked | confirmed | arrived | in_service | completed | cancelled | no_show | paid`.

| From | Allowed manual next |
|------|---------------------|
| booked | confirmed, arrived, cancelled, no_show |
| confirmed | arrived, cancelled, no_show |
| arrived | in_service, cancelled, no_show |
| in_service | completed, cancelled |
| completed, cancelled, no_show, paid | none |

There is no separate “check-in” status. Arrived is the check-in. Manual status `paid` is rejected: “Mark paid via invoice payment”. The payment path updates `paid` in SQL and does not use this transition table.

No-show is not allowed once status is `in_service`.

### 5.3 Reschedule and edit

Drag/resize on day, stylist, and chair views calls `rescheduleAppointmentAction`. Week view is for navigation and opening the detail, not the drag grid. Reschedule is blocked for cancelled and paid.

Edit drawer can change staff, resource, times, notes, and services **until an invoice id exists**. It cannot change the customer. It cannot set status to `paid`.

### 5.4 How an appointment becomes a bill

Detail drawer shows **Raise Sale** when status is `arrived`, `in_service`, or `completed` **and** `invoice_id` is empty.

1. `checkoutAppointmentAction` requires `action:billing.checkout`.
2. It calls `buildBasketFromAppointment` only to validate.
3. It `redirect`s to `/quick-sale?appointmentId=`.
4. The Quick Sale page loads the customer and one basket line per `fyh_appointment_services` row (qty 1, snapshotted price/GST, staff = the appointment staff at 100%).
5. The receptionist can still add products, change staff, discount, and take payment.
6. Complete Sale sends `source: 'appointment'` and the appointment id into `checkoutFromBasket`.

Blocked:

| Case | Error |
|------|--------|
| Unknown id | Appointment not found |
| Already has invoice | Appointment already checked out |
| Status not arrived / in_service / completed | Cannot checkout… mark Arrived or In Service first |
| No service rows | Appointment has no services |

`booked` and `confirmed` cannot raise a sale until someone marks **arrived**. A walk-in appointment often starts already `arrived`, so Raise Sale is available immediately. A pure Express Sale with no appointment never creates this row.

After pay:

- Full payment or ₹0 → appointment status **`paid`**, `invoice_id` set
- Marked fully due (unpaid invoice) → appointment status **`completed`**, `invoice_id` set
- A later payment that clears the invoice calls `applyPaidSideEffects`, which sets the appointment to **`paid`**

The appointment row is kept.

**TO BE VERIFIED:** `checkoutAppointmentAction` catches errors around `redirect()`. Next.js redirect works by throwing. If that throw is swallowed, Raise Sale would validate and then fail to navigate. Integration coverage proves the basket builder and the paid status update; the live button’s navigation was not clicked in a browser this pass.

### 5.5 Walk-in vs appointment vs Express Sale

| Path | Row created first | Invoice source |
|------|-------------------|----------------|
| Slot booking | `fyh_appointments.source = booking`, usually `booked` | `appointment` after Raise Sale |
| Walk-in checkbox on the calendar | same table, `source = walk_in`, status `arrived` | `appointment` after Raise Sale |
| 9-dot Express Sale with no appointment | customer only | `quick_sale` |

---

## 6. Billing architecture (single write path)

| Function | File | Role |
|----------|------|------|
| `priceBasket` | `src/hair/domain/basket/engine.ts` | Pure math: totals, attribution plan, ledger plan |
| `enrichBasketWithRedemptions` | `src/hair/domain/checkout/pipeline.ts` | Membership discount + legacy package amount |
| `checkoutFromBasket` | same | **Only authoritative persist** for Express Sale and appointment Raise Sale |
| `applyPaidSideEffects` | `src/hair/services/invoices.ts` | Runs only when the invoice is fully paid or the total is 0 |
| `summarizeInvoiceSettlement` | `src/hair/lib/billing/invoiceSettlement.ts` | Register/public **display** only |
| `finalizeQuickSale` | `services/invoices.ts` | **Deprecated.** Still callable from `completeQuickSaleLegacyAction`. The compact screen does not use it |
| `createInvoiceFromAppointment` | `services/invoices.ts` | **Deprecated.** Raise Sale does not call it |

```text
Basket (customerId, lines, staff, payments, flags)
  → priceBasket
  → discounts (line overrides + membership bps + optional legacy package paise)
  → GST-inclusive tax inside priceBasket
  → payments (cash/upi/card/wallet) capped at total
  → fyh_invoices + fyh_invoice_lines + fyh_invoice_payments
  → fyh_invoice_line_attributions
  → fyh_financial_ledger
  → timeline
  → only if fully paid: package credit burn, commission, inventory, membership/package activation, customer stats
  → reports read attributions + invoices
```

Dependencies if checkout changes: invoice register, public invoice, wallet, staff performance, commission, stock, appointment status, customer timeline, revenue dashboard.

---

## 7. Inventory side effects

**Canonical mutation:** `applyMovement` (`src/hair/services/stock.ts`).

| Trigger | When stock changes | Movement type | Quantity |
|---------|--------------------|---------------|----------|
| Service line on a **fully paid** invoice, and the service has consumables with `deduct_inventory` | `applyInventorySideEffects` | `consumption` | `-(kit qty × line qty)` |
| Product line on a **fully paid** invoice | same | `sale` | `-(line qty)` |
| Product created with opening qty | product create | `opening` | + |
| ERP purchase or legacy GRN | purchase post | `purchase` | + |
| Purchase return | return engine | `return` | − (stock out) |
| Manual adjustment, including damage/shrinkage | adjustments UI | `adjustment` | + or − |
| Express Sale **partial / unpaid** | never | — | — |
| Advance payment | never (side effects return immediately) | — | — |
| Historical import | never (same early return) | — | — |
| Transfers | not built | `transfer` exists only in the enum | — |
| On-floor issue/return | not built | floor table only, no `applyMovement` | — |

Retail vs professional product type does **not** choose the movement. `kind === 'product'` is enough.

Quick Sale and appointment invoices share this inventory function. Older FEATURES.md text that says Quick Sale retail stock is “next phase” is **stale**. **CURRENT BEHAVIOR:** code deducts on full payment for `source = quick_sale`.

---

## 8. Staff attribution

**Table:** `fyh_invoice_line_attributions`.

Columns that matter: `invoice_line_id`, `staff_id`, `role` (`serviced_by` | `sold_by`), `share_bps`, `attributed_net_paise`, `revenue_metric`.

Built by `buildAttributionPlan` (`src/hair/domain/basket/attribution.ts`) during `priceBasket`, inserted in `checkoutFromBasket` for Quick Sale. Appointment invoices that did not already have rows can be backfilled by `syncInvoiceLineAttributions` inside `applyPaidSideEffects` (skipped for `quick_sale`).

| Question | Answer in code |
|----------|----------------|
| Who performed the service? | Staff on that basket line, role `serviced_by`, share in bps |
| Who gets product sales credit? | Staff on that product line, role `sold_by`, if the receptionist picked someone. Not required |
| Who gets package-sale credit? | Nobody — package purchase lines are skipped |
| Commission | `evaluateCommissionsForInvoice` writes pending `fyh_commission_entries` from rules, else service override, else staff default. Legacy fallback only if the service line has **zero** attribution rows |
| Performance dashboards | Read attributions |
| Salary | Workforce payroll (`wf` payroll). No join from payroll generation into `fyh_commission_entries` was proven. **TO BE VERIFIED** if a pay run imports those entries. Paying a commission row is a separate action `action:staff.commission_pay` |
| Rules engine UI | `fyh_commission_rules` is read by the engine. A full rules admin screen was not found as a finished product. **PARTIAL** |

Multi-staff: equal bps unless shares were already set; paise remainder is corrected onto the first staff.

---

## 9. Customer data model

```text
fyh_customers
  identity: id, full_name, phone, customer_code, gender, email, dob, notes, source, is_active
  caches (not the money SSOT): wallet_balance_paise, reward_points, total_visits,
           lifetime_spend_paise, average_bill_paise, last_visit_at
  → fyh_customer_notes
  → fyh_customer_timeline          visits, bills, status text
  → fyh_appointments
       → fyh_appointment_services  frozen service name/price/GST
  → fyh_invoices
       → fyh_invoice_lines
       → fyh_invoice_payments
       → fyh_invoice_line_attributions → fyh_staff
  → fyh_financial_ledger           wallet + receivables SSOT
  → fyh_customer_memberships → fyh_membership_plans
  → fyh_customer_packages
       → fyh_customer_package_credits
       → package ledger
  → fyh_credit_notes
  → fyh_bridal_profiles            separate outstanding_paise column — who writes it: TO BE VERIFIED
```

Wallet math SSOT is the ledger (`advance_credit` minus `wallet_redemption`). `wallet_balance_paise` is a cache refreshed by `reconcileCustomerWalletCache`. Express Sale’s “Insufficient customer credit” check uses the **cache**.

Outstanding for the POS context is `sumCustomerReceivablePaise` (ledger). It is displayed beside the sale and is not part of `grand_total_paise`.

---

## 10. What the salon can configure

| Area | Status |
|------|--------|
| Services, prices, GST bps, duration, consumable kits | **IMPLEMENTED** |
| Products, prices, opening stock, brands | **IMPLEMENTED** |
| Membership plans | **IMPLEMENTED** |
| Package plans | **IMPLEMENTED** |
| Staff roster and link to workforce employees | **IMPLEMENTED** / schedules **PARTIAL** |
| Chairs/resources | **IMPLEMENTED** on salon settings (`ResourcesPanel`). Create-appointment modal does not send a resource. **PARTIAL** |
| Permissions (workforce grants) | **IMPLEMENTED** |
| Legacy page-key presets | **IMPLEMENTED** in code (`ROLE_PRESETS`); the settings screen the operator uses is the workforce panel |
| GST invoice identity, billing defaults, invoice prefix/sequence | **IMPLEMENTED** |
| Payment methods list | **PARTIAL** — schema has six methods; Express Sale shows three plus wallet |
| Discounts | **PARTIAL** — line % and price override at sale time; membership bps on the plan; no separate “today’s offer” campaign object found |
| Loyalty earn rules | **NOT IMPLEMENTED** (column only) |
| Salon name, hours, printer, appearance | **IMPLEMENTED** |
| WhatsApp / communication | settings forms **IMPLEMENTED**; outbound delivery **PARTIAL / TO BE VERIFIED** |
| Attendance office location | **IMPLEMENTED** when workforce engine is on |
| Multiple locations and transfers | **NOT IMPLEMENTED** as an operator workflow (columns and a placeholder page exist) |
| Gift cards | **NOT IMPLEMENTED** (blocked at pay) |
| Commission rule builder | **PARTIAL** — engine reads rules; admin UX not established in this pass |
| Language / currency | INR and `Asia/Kolkata` are hard-coded in several formatters. A salon currency switch was **not** found |

---

## 11. RBAC

### Legacy Hair

`HAIR_PERMISSIONS`: **16** `page:*` and **7** `action:*`.

Page keys: `dashboard`, `dashboard_revenue`, `dashboard_staff`, `customers`, `appointments`, `billing`, `quick_sale`, `services`, `memberships`, `packages`, `inventory`, `purchases`, `expenses`, `reports`, `settings`, `staff`.

Action keys: `inventory.adjust`, `billing.checkout`, `reports.export`, `settings.edit`, `staff.commission_pay`, `import.historical`, `packages.edit`.

`pagePermissionForPath` (first matching prefix):

| Path prefix | Key |
|-------------|-----|
| `/dashboard/revenue` | `page:dashboard_revenue` |
| `/dashboard/staff-performance` | `page:dashboard_staff` |
| `/dashboard` | `page:dashboard` |
| `/customers` | `page:customers` |
| `/appointments` | `page:appointments` |
| `/billing`, `/advance-payment` | `page:billing` |
| `/quick-sale` | `page:quick_sale` |
| `/inventory`, `/vendors` | `page:inventory` |
| `/purchases` | `page:purchases` |
| `/expenses` | `page:expenses` |
| `/reports` | `page:reports` |
| `/settings`, `/products` | `page:settings` |
| `/staff`, `/team` | `page:staff` |
| `/services` | `page:services` |
| `/packages` | `page:packages` |
| `/memberships` | `page:memberships` |
| `/loyalty` | `page:customers` |
| `/workforce` | `page:dashboard` |
| `/me`, `/attendance` | `page:appointments` |
| `/profile`, `/access-denied` | no page key |

Super admin bypasses the legacy list.

### Workforce

- `WORKFORCE_PERMISSION_LIBRARY`: **65** v1 keys (`key:` count in `library.ts`)
- `FYH_PERMISSION_CATALOG_V2`: **100** `def(...)` entries
- `FYH_RIGHTS_CATALOG`: **27** permission defs
- Merged `WORKFORCE_PERMISSION_LIBRARY_FULL` = those three spreads (**192** entries before any duplicate-key check). Uniqueness of the merged set: **TO BE VERIFIED**
- Older product-brain text that says “67 keys” does **not** match this count

Express Sale workforce keys used by actions:

| Action | Key |
|--------|-----|
| `searchCustomersForPosAction` (unused by the current search box) | `quick_sale.customer.search` |
| Staff roster / invoice preview | `quick_sale.access` |
| Totals preview | `quick_sale.sale.create` |
| Complete | `quick_sale.sale.complete` |
| Hold | `quick_sale.sale.hold` |
| Resume | `quick_sale.sale.resume` |

Appointment calendar can be filtered to one stylist when grants include `appointments.view_own` and not `appointments.view_all`.

### Bridge

`src/workforce/compat/hairAdminBridge.ts` maps workforce grants onto legacy `page:*` keys so the old nav still renders. The map is lossy (one workforce key can turn on two page keys). It does not grant `action:import.historical` or `action:staff.commission_pay`.

Workforce sessions: layout path check uses grants, not the legacy map.

### Data-level

`orgFilter` / `locationFilter` are no-ops unless `FYH_SAAS_TENANT=1`. Default production posture in docs is a single salon. Service modules (`invoices.ts`, `stock.ts`, `checkoutFromBasket`) do not check permissions themselves. They trust the action or the script that called them.

---

## 12. Business relationship map

```text
Customer (fyh_customers)
  → Visit on the calendar (fyh_appointments + fyh_appointment_services)   [optional]
  → Basket (in memory / sessionStorage; hold draft = fyh_invoices status draft)
  → Invoice (fyh_invoices + fyh_invoice_lines)
  → Payment (fyh_invoice_payments)
  → Ledger (fyh_financial_ledger)
  → Staff credit (fyh_invoice_line_attributions → fyh_staff)
  → Commission pending (fyh_commission_entries)          [only when fully paid]
  → Inventory (fyh_stock_movements + fyh_products.stock_qty)  [only when fully paid]
  → Membership / package entitlement (fyh_customer_memberships / fyh_customer_packages)
  → Timeline (fyh_customer_timeline)
  → Reports (read models over invoices + attributions + stock)
```

Supplier side, separate from the customer bill:

```text
Vendor (fyh_vendors)
  → Purchase (purchase brain and/or legacy PO/GRN)
  → Stock movement type purchase
  → Vendor ledger / vendor payments
```

People side:

```text
Login (wf_employees)  ↔  bookable stylist (fyh_staff)
Attendance / salary live on the workforce tables
Service credit lives on fyh_invoice_line_attributions
```

---

## 13. Scenarios A–J

Each cell is the status of that step **for that scenario** on the current Express Sale or Raise Sale path.

| Step | A New haircut | B Existing haircut | C Several services | D Several staff | E Service + retail | F UPI | G Cash | H Not fully paid | I Advance already recorded | J Membership / package |
|------|---------------|--------------------|--------------------|-----------------|--------------------|-------|--------|------------------|----------------------------|------------------------|
| Customer | **IMPLEMENTED** create modal, saved immediately | **IMPLEMENTED** search | same customer | same | same | same | same | same | same | same |
| Reception | **IMPLEMENTED** 9-dot Express Sale. No appointment required | same | same | same | same | same | same | same | same | same |
| Service selection | **IMPLEMENTED** catalog search | same | **IMPLEMENTED** multiple lines | same | service line + product line | — | — | — | — | package: buy plan **or** Available Services |
| Staff | **IMPLEMENTED** required on the service | same | each service line | **IMPLEMENTED** multiple staff, equal bps, all `serviced_by` | product staff **optional** (`sold_by`) | — | — | — | — | redemption line **requires** staff |
| Basket / price | catalog snapshot | same | sum of lines | shares do not change the customer total | both kinds in one `priceBasket` | same | same | same | wallet does not change list price | membership bps **IMPLEMENTED**; prepaid lines ₹0 **IMPLEMENTED** |
| Discount / tax | line % / price override + inclusive GST | same | same | same | same | same | same | same | same | membership discount automatic |
| Payment | must cover total unless due is flagged | same | same | same | same | **IMPLEMENTED** UPI chip | **IMPLEMENTED** Cash chip | **IMPLEMENTED** Mark as Due → `partial` or `unpaid` | **IMPLEMENTED** Use credit | ₹0 package-only bill completes as paid |
| Invoice | `checkoutFromBasket`, source `quick_sale` | same | one invoice, many lines | one invoice | one invoice | method `upi` | method `cash` | invoice exists, not fully paid | method `wallet` plus any other | source `quick_sale` |
| Inventory | consumables only if the haircut’s kit has `deduct_inventory` **and** the bill is fully paid | same | same | same | product `sale` movement **only if fully paid** | same | same | **NOT on this step** — stock waits until a later payment clears the bill | if wallet covers the total, bill is paid and stock **does** move | package sale does not deduct the service’s consumables until a redemption service line is billed and paid |
| Staff credit | `serviced_by` at checkout (rows inserted even before side effects) | same | one attribution set per line | split rows | product `sold_by` only if staff was picked | same | same | attribution rows are inserted at checkout even when unpaid. Commission entries wait for full payment | same | package purchase: no attribution |
| Customer history | timeline bill event immediately; visit stats only when paid | same | same | same | same | same | same | timeline yes; `total_visits` **not** incremented until paid | wallet cache drops by the amount redeemed when paid | package credits created on paid package sale; burned on paid redemption |
| Reports | after the invoice exists; staff revenue uses attributions | same | same | split paise | product metric vs service metric | payments report shows UPI | payments report shows cash | outstanding stays in ledger until settled | wallet movement in ledger | membership/package reports read entitlement tables |

**Scenario A note:** “New customer walks in for a haircut” does not require the calendar. If the desk instead checks **Walk-in** on the appointment modal, an appointment row is created and billing waits for **Raise Sale**. Both are implemented. They are different rows.

**Scenario H note:** Mark as Due is explicit. Paying less than the total **without** that flag fails validation. The customer’s older dues stay on the old invoices.

**Scenario I note:** Advance Payment and Express Sale are different screens. The credit must already be on the wallet before Use credit works.

**Scenario J note:** Loyalty points are **NOT IMPLEMENTED**. Membership discount and package redemption are **IMPLEMENTED** as described in §4.11–4.12, with a legacy auto package discount still in the server.

---

## 14. Feature vs product model

| Feature | Current behavior | Actual user workflow | Business purpose | Dependencies | Status | Gaps | Source |
|---------|------------------|----------------------|------------------|--------------|--------|------|--------|
| Express Sale | Compact POS | 9-dot → customer → items → staff → pay → success dialog | Walk-in bill | `checkoutFromBasket` | **IMPLEMENTED** | Hold **create** button not on screen | `QuickSaleShell.tsx` |
| Appointments | Calendar + drawers | Book → arrived → Raise Sale → same POS | Time and chair | appointments service, Quick Sale prefill | **IMPLEMENTED** | Create without a slot has no start time; per-service staff is notes text | `appointments.ts`, `appointmentBridge.ts` |
| Invoice register | List + detail | Find bill, take balance, print, correct | After the sale | `summarizeInvoiceSettlement`, `recordInvoicePayments` | **IMPLEMENTED** | Gift card pay throws | `BillingUi`, `invoices.ts` |
| Advance | Modal or page | Search customer, enter amount | Money before the service | ledger credit, no stock | **IMPLEMENTED** | Not auto-applied to the next bill | `advancePayment.ts` |
| Customers | CRM | Search, create, profile, timeline | Identity | `fyh_customers` | **IMPLEMENTED** | Points column unused | `customers.ts` |
| Services | Catalog CRUD | Settings-style catalog | What can be sold | snapshots on book and bill | **IMPLEMENTED** | Action auth is `requireHairAuth` | `ServicesUi` |
| Products | Catalog CRUD | `/products` | Retail + backbar | stock qty | **IMPLEMENTED** | Page permission is `page:settings` | `ProductsUi` |
| Inventory stock | Ledger | Adjust, read movements | On-hand qty | `applyMovement` | **IMPLEMENTED** | Transfers placeholder; on-floor read-only | `stock.ts` |
| Purchases | Two UIs | ERP `/purchases` and legacy `/inventory/purchases` | Buy stock | vendors, movements | **PARTIAL** | Duplicate routes | `purchaseBrain`, `purchases.ts` |
| Vendors | List + ledger | `/vendors` | Supplier balance | vendor brain | **IMPLEMENTED** | Legacy `/inventory/vendors` only redirects | `VendorLedgerUi` |
| Expenses | List + 9-dot modal | Record spend | Non-customer cost | `fyh_expenses` | **IMPLEMENTED** | Salary is a different engine | `ExpensesUi` |
| Staff | Roster + workforce profile | Hire, link, open profile | Who can be on a bill | `fyh_staff`, `wf_employees` | **PARTIAL** | Schedule UI thinner than calendar conflict checks | `StaffUi` |
| Attendance | Self + team + map | Photo clock, office geo | Presence | workforce | **IMPLEMENTED** if engine on | Layout key is `page:appointments` | attendance pages |
| Loyalty points | Display + report | Profile “Points” | Repeat reward | column only | **NOT IMPLEMENTED** | No writer | `customers.ts` schema |
| Memberships | Plan admin + auto % + sale line | Configure, sell on POS | Discount club | `computeRedemptions` | **IMPLEMENTED** | One membership, no picker | `loyaltyOps`, pipeline |
| Packages | Plan admin + sell + Available Services | Configure, sell, redeem | Prepaid sessions | credits module | **IMPLEMENTED** | Legacy auto-burn still in server | `PackagesUi`, pipeline |
| Reports | Many live pages | Open report | Management | attributions, stock, ledger | **PARTIAL** | Some TZ edge cases called out in older audits; not re-measured here | `reportQueries` |
| Dashboards | Revenue, staff, front desk | Home numbers | Same day control | paid invoices | **IMPLEMENTED** | Front desk is a reduced set | dashboard pages |
| Notifications | Enqueue after checkout | Nobody sees a guaranteed WhatsApp | Reminders | outbox | **PARTIAL** | No Hair cron; delivery stub | `notifications.ts` |
| Public invoice | `/i/{number}` | Link from success dialog | Customer copy | token + number | **IMPLEMENTED** | Org scoping **TO BE VERIFIED** | `PublicFyhInvoice` |
| Settings | Forms listed in §U | Owner configures salon | Policy | `fyh_settings` | **IMPLEMENTED** | Currency/language not a switch | settings pages |
| Platform admin | Separate app | FYTECH operator | Many salons later | Platform DB | **IMPLEMENTED** as admin | Not the salon day flow | `src/platform` |
| Auth | Login, org picker | Staff sign in | Access | workforce session | **PARTIAL** | Forgot password placeholder; SaaS flag off by default | `auth/login` |
| Gift cards | Enum + label | Pay with gift card | Stored value | payment layer | **BROKEN** | Throws | `invoices.ts` |
| Commission rules | Engine on full pay | No clear daily UI | Payout | `fyh_commission_entries` | **PARTIAL** | Salary payroll is separate | `commissionEngine.ts` |
| Hold bills | Draft invoices | Resume from customer step | Park a bill | `quickSaleHold.ts` | **PARTIAL** | Cannot start a new hold from compact POS | `QuickSaleShell.tsx` |
| Historical import | Settings panel | Super admin | Old sales | import service | **IMPLEMENTED** | Side effects skipped for that source | `historicalImport.ts` |

---

## 15. Where current behavior differs from older product-brain text

These are corrections from this code pass. The older sentences were **not** deleted from `FYHAIR-SALON-BRAIN.md`.

| Older statement | Code now |
|-----------------|----------|
| Quick Sale retail stock is “next phase” / not deducted | `applyInventorySideEffects` runs for `quick_sale` when the invoice is fully paid |
| Inventory section: “Quick Sale retail deduction not live” | Same correction. Partial invoices still do not deduct |
| Hold bills “working” as a full UX | Resume works. Create-hold button is not on the compact screen |
| Global “+ New” menu | Does not exist. 9-dot: Express Sale, Advance Payment, Add Expense |
| Appointment checkout builds the invoice immediately | **Raise Sale** only redirects. The invoice is created by Express Sale complete |
| Every line needs staff before checkout | Only services in SERVICE mode and prepaid redemptions |
| Workforce RBAC is “67 keys” | v1 library is 65; full merge is 65+100+27 entries |
| Express Sale search uses `quick_sale.customer.search` | The box uses the booking search action and page-permission OR |
| Loyalty is a points program at checkout | Points are not written. Wallet and packages are the live mechanisms |
| Package/membership redemption “not implemented” | Explicit prepaid lines and membership bps **are** implemented. A legacy auto package discount also remains |

---

## 16. Known gaps (proven)

1. Compact POS cannot **create** a held bill from the UI.
2. Gift card payment throws.
3. Forgot password is a placeholder.
4. Loyalty points have no writer.
5. Two purchase UIs (`/purchases` and `/inventory/purchases`).
6. Transfers page is a placeholder. On-floor is read-only.
7. Notification delivery is not a finished channel.
8. No Hair cron.
9. Tenant filters do nothing until `FYH_SAAS_TENANT=1`.
10. Public invoice org scope not re-proven (ISS-02 stands as a documented risk).
11. Service-layer functions do not check permissions.
12. Attendance layout permission is `page:appointments`.
13. Products layout permission is `page:settings`.
14. Damage is an adjustment, not its own movement.
15. Per-service staff on an appointment is notes text; the bill uses one `staffId`.
16. `reward_points` and gift-card amounts on invoices stay at default/zero.
17. `checkoutAppointmentAction` redirect-inside-try: **TO BE VERIFIED** in the browser.
18. Invoice cancellation stock reversal: **TO BE VERIFIED** line by line.
19. Production migration state (0036/0037): **TO BE VERIFIED** on the database. Not visible from source alone.

---

## 17. Decisions still belonging to the business

Not answered by code:

1. Should a walk-in haircut be an appointment plus Raise Sale, or only Express Sale? Both exist.
2. Should old dues be added onto the new bill? Today they are not.
3. Is Mark as Due the intended credit policy, or should the desk be blocked?
4. Should inventory move when the bill is partial? Today it waits for full payment.
5. Should product lines require a seller? Today they do not.
6. Keep both purchase screens or one?
7. Turn loyalty points on, or remove them from the profile?
8. Gift cards: build or remove the label?
9. Is the legacy automatic package discount still wanted beside Available Services?
10. When a second salon is added, what is the public invoice URL? (SaaS flag is off.)
11. Should commission entries feed salary, or stay a separate payout?
12. WhatsApp: which events must actually send?

Prior TBD-01…TBD-12 in `FYHAIR-SALON-BRAIN.md` (migration state, tenant cutover, route consolidation, RBAC end state) are still open. This list is the operator-facing subset proven by the workflow gap, not a replacement catalog.

---

## 18. Final report

1. **Screens/routes inspected:** **97** `page.tsx` files under `app/(hair)/fyh` (imports or redirect targets). Platform admin pages were not re-counted file-by-file this pass; they remain the separate Platform app described in §W.
2. **Features inspected:** the operational set in §14 (Express Sale through historical import), covering groups A–X.
3. **APIs / server actions:** **33** files in `src/hair/actions/`. Express Sale, appointments, booking, and customers actions were read. Workforce permission and payroll actions were identified from the pages that import them, not every workforce action body.
4. **Database tables inspected in the workflow:** customers, notes, timeline, appointments, appointment services, invoices, invoice lines, invoice payments, invoice line attributions, financial ledger, stock movements, products, service consumables, commission entries, memberships, packages and credits, settings, staff. Full Hair table inventory remains in `FYHAIR-COMPLETE-AUDIT.md` Part 6 (~54 `fyh_*` plus workforce `wf_*` plus Platform DB). This pass did not open every `CREATE TABLE`.
5. **Canonical billing path:** `completeQuickSaleAction` → `checkoutFromBasket` → `priceBasket` → invoice/payment/attribution/ledger → `applyPaidSideEffects` only if fully paid or total is ₹0.
6. **Canonical inventory path:** `applyMovement`, called from `applyInventorySideEffects` on that same full-pay moment (and from purchases, GRN, adjustments, product opening qty, purchase returns).
7. **Canonical customer path:** `fyh_customers` + `fyh_financial_ledger` (wallet and receivables) + `fyh_customer_timeline`.
8. **Canonical staff-attribution path:** `buildAttributionPlan` → `fyh_invoice_line_attributions`. Commission is a later full-pay side effect, not the performance SSOT.
9. **Express Sale path:** 9-dot **Express Sale** → `/quick-sale` → `QuickSaleShell` → `completeQuickSaleAction` → `checkoutFromBasket`.
10. **Appointment → billing path:** calendar **Raise Sale** → `checkoutAppointmentAction` → redirect `/quick-sale?appointmentId=` → same checkout with `source: 'appointment'`.
11. **Current known gaps:** §16.
12. **Differs from older Core Product / FEATURES wording:** §15. Trust this file plus `pipeline.ts` / `invoices.ts` over “next phase” stock notes.
13. **Business decisions:** §17.

---

## 19. Route index (97 pages)

Redirects are noted. All other routes render the module listed in §3 or the page-import pass.

`/access-denied`, `/advance-payment`, `/appointments`, `/attendance` (self; engine-gated), `/attendance/manage`, `/attendance/map`, `/auth/login`, `/billing` → invoices, `/billing/invoices`, `/billing/[invoiceId]`, `/brand-concepts`, `/customers`, `/customers/new`, `/customers/[id]`, `/dashboard` → child, `/dashboard/front-desk`, `/dashboard/revenue`, `/dashboard/staff-performance`, `/expenses`, `/expenses/salary`, `/i/[invoiceNumber]`, `/inventory` → stock, `/inventory/adjustments`, `/inventory/adjustments/new`, `/inventory/movements`, `/inventory/on-floor`, `/inventory/purchases`, `/inventory/purchases/new`, `/inventory/purchases/[id]`, `/inventory/stock`, `/inventory/transfers` (placeholder), `/inventory/vendors` → `/vendors`, `/inventory/vendors/new` → `/vendors/new`, `/inventory/vendors/[id]` → `/vendors/[id]`, `/invoice/[invoiceNumber]` → `/i/…`, `/landing` → role home, `/loyalty`, `/me`, `/membership-packages` → `/packages`, `/memberships`, `/packages`, `/products`, `/products/new` → `?add=1`, `/products/[id]` → `?edit=`, `/profile`, `/purchases`, `/purchases/new`, `/purchases/[id]`, `/purchases/[id]/edit`, `/quick-sale`, `/reports`, `/reports/customers/loyalty`, `/reports/customers/memberships`, `/reports/customers/packages`, `/reports/finance/discounts`, `/reports/finance/gst`, `/reports/finance/payments`, `/reports/inventory/low-stock`, `/reports/inventory/products`, `/reports/inventory/stock`, `/reports/revenue/daily`, `/reports/revenue/monthly`, `/reports/revenue/yearly`, `/reports/staff/[metric]`, `/salon-software`, `/select-organization`, `/services`, `/services/new`, `/services/[id]`, `/settings` → salon, `/settings/appearance`, `/settings/attendance`, `/settings/billing`, `/settings/communication`, `/settings/gst-invoice`, `/settings/historical-import`, `/settings/inventory`, `/settings/permissions`, `/settings/printer`, `/settings/salon`, `/settings/security`, `/settings/whatsapp`, `/staff`, `/staff/[employeeId]`, `/staff/[id]/performance`, `/staff/performance` → staff-performance dashboard, `/subscribe`, `/system-map`, `/team`, `/team/[memberId]`, `/vendors`, `/vendors/new`, `/vendors/[id]`, `/vendors/[id]/edit`, `/workforce` → `/staff`, `/workforce/home`, `/workforce/operations`.

---

## 20. Continued forensic pass — business rules (2026-10-04)

This section does not repeat the 97-screen map. It records workflows read in source after the first extraction. Labels: **IMPLEMENTED**, **PARTIAL**, **BROKEN**, **NOT IMPLEMENTED**, **CURRENT BEHAVIOR**, **KNOWN GAP**, **UNKNOWN**, **BUSINESS DECISION REQUIRED**.

### 20.1 Appointment → service → billing

Stored on create (`createAppointment` in `src/hair/services/appointments.ts`):

| Stored | Table |
|--------|--------|
| Customer id, one staff id, optional resource, start/end, status, source (`booking` or `walk_in`), buffer minutes, notes, recurrence parent | `fyh_appointments` |
| One row per service: service id, name, duration, price, GST snapshot | `fyh_appointment_services` |
| Timeline “Appointment booked” | `fyh_customer_timeline` (`event_type = appointment`) |

1. **What creation does:** validates hours and conflicts, inserts the appointment and service snapshots, writes the timeline event, and attempts a notification enqueue. It does **not** create an invoice or move stock.
2. **New customer during create:** **IMPLEMENTED.** Same `FyhCustomerCreateModal` as Express Sale (`createContext="appointment_booking"`). The customer is saved first. The appointment is a second submit.
3. **Staff mandatory:** **IMPLEMENTED** for the appointment row (`staffId`). One stylist for the whole visit.
4. **Multiple services:** **IMPLEMENTED.**
5. **Different staff per service:** **NOT IMPLEMENTED** as data. The create UI can put per-service names into **notes text**. `buildBasketFromAppointment` copies the single appointment `staffId` onto every line.
6. **Arrival:** there is no check-in entity. The desk sets status **arrived** (`updateAppointmentStatus`). Allowed from `booked` or `confirmed`. Timeline title becomes `Appointment arrived`.
7. **Service performed:** status **in_service** (from arrived), then **completed** (from in_service). These statuses do not create a bill and do not move stock.
8. **Raise Sale:** **IMPLEMENTED** only from `arrived`, `in_service`, or `completed`, and only when `invoice_id` is empty. `checkoutAppointmentAction` validates with `buildBasketFromAppointment` and redirects to `/quick-sale?appointmentId=`. It does not insert an invoice.
9. **appointmentId:** query param on Express Sale, then `checkoutFromBasket` writes `fyh_invoices.appointment_id` and `fyh_appointments.invoice_id`.
10. **How Express Sale knows:** `source: 'appointment'` is sent by `completeQuickSaleAction` when `appointmentId` is set. The page also shows an “Appointment checkout” eyebrow and prefills lines.
11. **Walk-in with no appointment:** **IMPLEMENTED** as Express Sale alone. No appointment row. Invoice `source = quick_sale`.
12. **Separate walk-in workflow:** **PARTIAL.** See §20.13. A calendar checkbox creates an appointment with `source = walk_in` and status `arrived`. That is still the appointment path.
13. **Bill again after checkout:** **NOT IMPLEMENTED.** Raise Sale throws `Appointment already checked out` when `invoice_id` is set. Cancelling the invoice does **not** clear `invoice_id` (`cancelInvoice` never updates `fyh_appointments`). **KNOWN GAP:** a voided appointment bill cannot be raised again from the calendar.
14. **Cancellation:** status `cancelled` from booked, confirmed, arrived, or in_service. The slot is freed (`NON_OCCUPYING`). Timeline event is written. No invoice, stock, or payment effect, because none exist yet unless a bill was already raised.
15. **No-show:** status `no_show` from booked, confirmed, or arrived. **Not** from `in_service`. Slot freed. No financial effect.
16. **Reschedule:** drag/resize or edit. Blocked when status is `cancelled` or `paid`. Does not change the customer. Does not touch an invoice.

Status path that is **IMPLEMENTED:** `booked → confirmed → arrived → in_service → completed`, then Raise Sale → Express Sale → invoice `paid` (full pay or ₹0) or appointment `completed` (invoice exists but not fully paid). Later full payment sets the appointment to `paid`.

### 20.2 Customer lifecycle

| Step | Current behavior | Status |
|------|------------------|--------|
| New customer from Express Sale or booking | `createCustomerQuick`: name, phone, gender default female, `source = walk_in`, code `CL` + 8 digits | **IMPLEMENTED** |
| New customer from `/customers/new` | `createCustomer` via `src/hair/actions/customers.ts`. Richer fields. Does **not** call `nextCustomerCode` | **PARTIAL** — `customer_code` stays null unless a later path sets it. **KNOWN GAP** |
| Identity | UUID `fyh_customers.id` is the foreign key. Display code is `customer_code` | **IMPLEMENTED** |
| Phone uniqueness | `assertPhoneUnique` among **active** customers (`is_active = true`). Error: `Phone already used by {name}` | **IMPLEMENTED** |
| Duplicate name | Allowed | **CURRENT BEHAVIOR** |
| Similar-customer warning | Full `createCustomer` only, unless `forceCreate`. Matches phone, WhatsApp, email. Quick create skips this and only enforces unique phone | **PARTIAL** |
| Search | Express Sale / booking: name, phone, code, 1 character. Header search is a different action | **IMPLEMENTED** |
| Edit | `updateCustomer` re-checks phone, writes timeline `profile_updated` | **IMPLEMENTED** |
| Delete | **NOT IMPLEMENTED.** `archiveCustomer` sets `is_active = false`. Archived phone can be reused | **IMPLEMENTED** as archive |
| First sale onward | Invoice, payments, timeline `bill`, later appointments, memberships, packages | **IMPLEMENTED** |
| Outstanding | Ledger `receivable_open` minus settlements, excluding void invoices (`sumCustomerReceivablePaise`) | **IMPLEMENTED** |
| Loyalty points | Column shown. No writer | **NOT IMPLEMENTED** as a flow |

Full CRM fields (`CustomerInput`): name, phone, WhatsApp, email, gender, DOB, anniversary, address, city, state, pincode, occupation, hair type, skin type, allergies, preferred stylist, referred by, tags, notes, important alerts, source (`walk_in | referral | instagram | whatsapp | other`), membership text, favourite service, favourite stylist.

Tables: `fyh_customers`, `fyh_customer_notes`, `fyh_customer_timeline`, `fyh_appointments`, `fyh_appointment_services`, `fyh_invoices`, `fyh_invoice_lines`, `fyh_invoice_payments`, `fyh_invoice_line_attributions`, `fyh_financial_ledger`, `fyh_customer_memberships`, `fyh_customer_packages`, `fyh_customer_package_credits`, `fyh_package_credit_ledger`.

Sources: `src/hair/services/customers.ts`, `src/hair/actions/customers.ts`, `src/hair/services/customerTimeline.ts`, `src/hair/services/customerAdvance.ts`.

### 20.3 Express Sale rules by topic

| Topic | When the line is added | Price | Checkout | Full payment only | Partial / unpaid | Zero total | Cancel / correct |
|-------|------------------------|-------|----------|-------------------|------------------|------------|------------------|
| Service | Catalog snapshot, qty 1, staff empty until picked | Snapshot selling price, line % or price override, then membership bps on the service+product subtotal | Line + `serviced_by` attribution | Consumables if `deduct_inventory`; service booking stats; commission | Line and attribution stored. No stock, no commission, no visit counter | If the whole bill is ₹0, status `paid` and side effects run | See §20.10. Stock and commission are not reversed |
| Product | Same add | Snapshot. Staff optional | Line + `sold_by` only if staff picked | `applyMovement` type `sale`, qty = −line qty | No stock movement | Same as service | Stock stays reduced |
| Membership | Plan price from catalog | Plan `pricePaise`. Discount bps is **not** applied to the membership line itself (discount subtotal is services and products only) | Line stored. Package/membership purchase lines skip attribution | `sellMembershipWithDb` | Entitlement **not** created | Side effects run | Entitlement is **not** deactivated by void |
| Package purchase | Plan price | Offer price on the plan | Line stored. No attribution | `sellPackageWithDb` creates credits | Credits **not** created | Side effects run | Credits are **not** removed by void |
| Package redemption | Available Services modal | Final ₹0, GST 0 | Prepaid line, staff required, `serviced_by` | `redeemPackageCredits` inside the checkout transaction (also when total is ₹0, because that counts as paid) | If the bill is not paid, credits are **not** burned (redeem runs only in the paid branch) | Burns credits | Burn is **not** undone by void |
| Discount | Line % sets `overridePricePaise`. No salon-wide discount campaign | Membership bps recomputed at checkout | Stored as line `discount_paise` / `discount_bps` and invoice `membership_redemption_paise` | No extra discount step | Discount already on the invoice | — | Original amounts stay on the void invoice |
| GST | Inclusive math in `priceBasket` | Per-line `gstBps` from catalog | `tax_paise` on invoice and lines | — | Tax is stored even if unpaid | Prepaid lines store GST 0 | Unchanged on void |
| Customer credit | “Use credit” adds method `wallet` | Does not change list price | `wallet_redemption` ledger debit; cache checked before commit | Visit stats also subtract redeemed wallet from the cache, then reconcile | Wallet is debited at checkout even when the invoice is only partial, because payments are posted in the checkout transaction before the paid check | No wallet row if pay sum is 0 | Void **excludes** that invoice’s ledger rows from the wallet cache, so used credit comes back as a balance. Cash is not handed back by the software |
| Mark as Due | Flag, not a line | — | Status `partial` or `unpaid`. Ledger `receivable_open` for the remainder | Stock/commission/entitlements wait | This **is** the partial path | Not used when total is 0 (status is paid) | Open receivable disappears from the customer due because void ledger rows are excluded |
| Staff | Required before complete for services and redemptions | Does not change the customer total | Attribution rows inserted immediately | Commission rows | Attribution stays; commission waits | Attribution still inserted | Attribution rows stay. Performance queries exclude `void` |
| Inventory | Nothing at add time | — | Nothing until full pay | `applyMovement` | **No movement** | Movement runs because status is paid | **No reversing movement** |
| Commission | Nothing at add time | Rules at full pay | Nothing until `paidAt` is set | `evaluateCommissionsForInvoice` writes `pending` | **No commission row** | Runs if `paidAt` is set (₹0 bills set `paidAt`) | Rows are **not** voided or deleted |

`planInvoiceCancellationLedger` in `invoiceCancellationPlan.ts` would post reversing receivable and wallet entries. **`cancelInvoice` never calls it.** **CURRENT BEHAVIOR:** void is a status plus “ignore this invoice’s ledger rows,” not a posted reversal.

### 20.4 Payment modes — customer credit is not “mark as due”

| Mode | Record | Invoice status if it covers the total | Ledger | Outstanding | Inventory / commission | Receipt |
|------|--------|----------------------------------------|--------|-------------|------------------------|---------|
| Cash | `fyh_invoice_payments.method = cash` | `paid` | Debit account `cash`, kind `payment_received`; credit AR `payment_received` when the bill is not left open | 0 if fully covered | Side effects run | Success dialog print / public `/i/` |
| UPI | method `upi` | `paid` | Same pattern, account `upi` | 0 | Same | Same |
| Card | method `card` | `paid` | Account `card` | 0 | Same | Same |
| Customer credit | method `wallet` | `paid` if credit covers the total | Debit `customer_wallet` / `wallet_redemption`. The customer’s **existing advance goes down** | 0 | Same, because the bill is paid | Same. No new cash is taken |
| Mark as Due | **No payment row** for the unpaid part. Flag `markDue` or `markFullDue` | `partial` if some tender was taken; `unpaid` if nothing was taken | Extra debit AR `receivable_open` for the remainder. The customer **owes the salon** | Increases | **Do not run** until a later payment clears the invoice | Invoice still printable. It is not a paid bill |
| Split | Several `fyh_invoice_payments` rows | `paid` only if the sum covers the total (unless Mark as Due) | One ledger pair per tender | Remainder only if Mark as Due | Full-pay rule | Payment modes string on the preview |
| Advance Payment (earlier screen) | Separate invoice `source = advance_payment`, no sale lines | That invoice is the credit receipt, not a service bill | Tender debit + `advance_credit` on `customer_wallet` | Does not create a service due | No stock, no commission (`applyPaidSideEffects` returns immediately) | Advance UI, not the Express Sale success dialog |
| Overpay ticked as Advance | Extra above the total, cash or card only | Service invoice `paid` | Additional `advance_credit` | 0 on this bill; wallet **increases** | Side effects run | Success dialog returns `advancePaise` |
| Gift card | — | — | — | — | — | **BROKEN** — `recordInvoicePayments` throws |
| Bank | In the payment enum and on the advance API | **NOT** an Express Sale chip | Used by advance receive | — | — | Advance path only |

**Customer credit** spends money the customer already gave the salon. **Mark as Due** records money the customer still owes. They move the ledger in opposite directions.

A later collection on an open invoice uses `planInvoiceSettlementLedger` (`receivable_settled`), not a new sale. When that collection makes `amount_paid >= grand_total`, `applyPaidSideEffects` runs once.

### 20.5 Inventory mutations

| Case | Trigger | Function | Movement | Qty | When | Linked to |
|------|---------|----------|----------|-----|------|-----------|
| A. Retail sale | Product line on a fully paid invoice | `applyInventorySideEffects` → `applyMovement` | `sale` | −line quantity | Full payment or ₹0 bill | `reference_type = invoice` |
| B. Service consumable | Service line whose kit has `deduct_inventory` | same | `consumption` | −(kit qty × line qty) | Same | invoice |
| C. Purchase | ERP purchase or legacy GRN | purchase engines | `purchase` | + | When the purchase/GRN is posted, not when a customer pays | purchase / goods receipt |
| D. Purchase return | `purchaseReturnEngine` | `applyMovement` | `return` | − (stock leaves the salon) | When the return is posted | `purchase_return` |
| E. Sales return | — | — | — | — | **NOT IMPLEMENTED.** No customer-invoice stock reversal | — |
| F. Damage / loss | Adjustments screen copy says use a manual adjustment | `applyMovement` | `adjustment` | + or − as entered | When the operator saves the adjustment | adjustment |
| G. Stock adjustment | Same | `adjustment` | operator delta | On save | — |
| H. Transfer | Transfers page text only | — | enum value `transfer` is unused | — | **NOT IMPLEMENTED** | — |
| I. Opening stock | Product create | `opening` | opening qty | On create | product |
| Basket created / appointment booked / partial pay | — | — | — | **No stock movement** | — |
| Invoice void | `cancelInvoice` | — | — | **No reversing movement. KNOWN GAP** | — |

`fyh_credit_notes` exists in schema with the comment “Phase 2 foundation.” No service inserts a credit note. **UNKNOWN** whether any production row exists. The application workflow does not create one.

### 20.6 Staff attribution and commission

- Services: staff **mandatory** before Complete Sale. Several staff on one service split 10,000 bps equally. Role `serviced_by`.
- Different services on one invoice can have different staff. **IMPLEMENTED.**
- Products: staff picker is optional. Role `sold_by` if someone is chosen.
- One invoice can carry many staff. **IMPLEMENTED.**
- Rows: `fyh_invoice_line_attributions`, inserted at checkout, including unpaid invoices.
- Commission: `evaluateCommissionsForInvoice` runs only when `paidAt` is set. Amount priority: `fyh_commission_rules` config, else service override (`override_staff_commission`), else staff default percent or fixed. Share bps scales the amount. Status inserted as **`pending`**.
- Payable: not a separate status. An operator on `/loyalty` runs `markCommissionsPaidAction` (`action:staff.commission_pay`), which sets **all pending rows for that staff** to `paid` with `paid_at`. It does not create a payroll line.
- Payroll: workforce salary is a different store. **No code path found** that copies `fyh_commission_entries` into salary. **NOT IMPLEMENTED** as a feed.
- Reports: staff performance reads attributions and **excludes void invoices**. Commission list is the loyalty screen, not the salary page.

### 20.7 Membership — IMPLEMENTED vs not

| Behavior | Status |
|----------|--------|
| Plan fields: name, tier (`silver/gold/platinum/vip`), `discount_bps`, price, `validity_days` (default 365), priority booking flag, birthday text, anniversary text, `reward_multiplier_bps` | **IMPLEMENTED** as stored configuration (`/memberships`) |
| Purchase on Express Sale, entitlement only after full payment | **IMPLEMENTED** |
| On purchase, other memberships for that customer are set `is_active = false`. New row `starts_on` today, `expires_on` today + `validity_days`. `fyh_customers.membership` is set to the plan name | **IMPLEMENTED** |
| Checkout discount | **IMPLEMENTED** for the first active membership with `expires_on >= today`. Percent of service+product subtotal. No service allow-list and no product allow-list exist on the plan |
| `priority_booking`, birthday benefit, anniversary offer, reward multiplier | **NOT IMPLEMENTED** as behavior. Written on seed defaults only. Checkout never reads them |
| Eligible services / products | **NOT IMPLEMENTED** as a restriction. The discount applies to every service and product line in the discount subtotal |
| Payment | The membership line is a normal catalog line. Paying it is the same Cash/UPI/Card/credit/due rules |
| Invoice link | The sale invoice has `kind = membership`. The entitlement row does **not** store `invoice_id` |
| Expiry | Discount query requires `expires_on >= today`. There is no cron that flips `is_active` | **PARTIAL** |
| Cancel membership / refund membership | **NOT IMPLEMENTED.** Voiding the sale invoice does not deactivate `fyh_customer_memberships` |
| Staff on the membership line | Not required. Attribution only if a seller was picked (`sold_by`) |
| Report | `/reports/customers/memberships` | **IMPLEMENTED** as a report page |

### 20.8 Packages — IMPLEMENTED

Definition (`/packages`): name, price, normal value, validity days (null means no expiry in the entitlement writer), either `fyh_package_plan_items` (service id + quantity) or a legacy single `service_id` plus `total_sessions`.

Purchase: Express Sale line. On full payment, `createCustomerPackageEntitlement` inserts `fyh_customer_packages`, one `fyh_customer_package_credits` row per service, and `fyh_package_credit_ledger` event `purchase`. `packages_purchased` on the customer increments. Credits are services only, not products.

Redemption: **Available Services** on the sale step lists credits with `used < total`, package active, not frozen, not expired. Adding them creates ₹0 lines. On paid checkout, `redeemPackageCredits` increments `used_credits` and writes a ledger event. Idempotency key prevents a double burn for the same invoice and credit.

Staff: required on the redemption line (`serviced_by`).

Remaining entitlement: `total_credits - used_credits`, shown in Express Sale context and on the customer profile package count.

Not undone by invoice void. **KNOWN GAP.**

Legacy auto-discount in `computeRedemptions` (one session valued as plan price / sessions) still runs when the basket has no explicit prepaid line. **CURRENT BEHAVIOR.** The receptionist’s control is Available Services.

### 20.9 Loyalty points

Tables involved: `fyh_customers.reward_points` (default 0), `fyh_membership_plans.reward_multiplier_bps` (stored, unread).

No earn function, no burn function, no checkout payment method, no API that sets the column. The profile shows “Points.” The loyalty report lists customers with points &gt; 0 or a membership name.

**LOYALTY POINTS ARE NOT CURRENTLY A COMPLETE FINANCIAL/BUSINESS FLOW.**

What `/loyalty` actually operates: membership/package helpers, commission rows, wallet top-up action, notification outbox panel. That screen is not a points program.

### 20.10 Cancellation, correction, refund

`InvoiceBillCorrectionDialog` (`src/hair/components/billing/InvoiceBillCorrection.tsx`):

| Button | What the code does |
|--------|-------------------|
| Cancel bill | `cancelInvoiceAction` → status `void`, reason appended to notes (minimum 3 characters). Permission `billing.bill.edit` |
| Edit bill | **The same cancel.** Then `router.push('/quick-sale')` with **no** customer, **no** lines, and **no** link to the voided invoice. Copy on screen: “An issued bill is not rewritten.” |

`cancelInvoice` (`src/hair/services/invoiceCancellation.ts`):

| Thing | What happens |
|-------|----------------|
| Invoice | `status = void`, `voided_at` set. Lines, payments, attributions **stay** |
| Ledger rows | **Stay.** `excludeVoidInvoiceLedger` drops them from wallet cache and receivable sums |
| Cash / UPI / card | **Not refunded** by the software. No cash-out record |
| Customer credit used on that bill | Comes back onto the wallet **cache**, because those ledger rows are ignored. No new `advance_credit` row is posted (`planInvoiceCancellationLedger` is unused) |
| Inventory | **Unchanged** |
| Commission | **Unchanged** (still pending or paid) |
| Membership / package entitlement and burned credits | **Unchanged** |
| Appointment `invoice_id` | **Unchanged**, so Raise Sale stays blocked |
| Customer timeline | **No** cancel event is inserted |
| Revenue dashboard | Paid totals use `status = paid`, so the void bill drops out |
| Staff performance | Excludes `status = void` |
| Refund | Status `refunded` exists and revenue code sums it. **No writer** sets an invoice to `refunded`. **NOT IMPLEMENTED** |
| Credit note | Table only. **NOT IMPLEMENTED** |

Already-void and `refunded` invoices cannot be cancelled again (`invoiceCanBeCancelled`).

### 20.11 What the customer profile shows

`/customers/[id]` loads `getCustomerProfile`, `getUnifiedCustomerTimeline`, `getCustomerFinancialSummary`, `getCustomerCreditSummary`, `listCustomerCreditHistory`.

Profile stats include due, points, packages purchased, and active membership name.

Timeline categories (`customerTimeline.ts`): visit (appointment events), bill, payment, wallet (advance credited, wallet applied, balance marked due, due settled), loyalty (membership/package event types), note, profile (created / updated).

Filters merge `fyh_customer_timeline` with `fyh_financial_ledger` rows. Invoice-shaped bill events are de-duplicated against invoice records.

Notes are `fyh_customer_notes` (optional alert flag), separate from the timeline.

The profile does not embed the appointment grid. Appointments appear as timeline events. Services and products appear as invoice lines behind bill events, not as their own profile tabs. **UNKNOWN** whether every historical invoice line is expanded in the timeline card without opening the invoice. The data is on `fyh_invoice_lines`.

### 20.12 Who configures what

| Item | Where | Who (permission) | Fields that change behavior | What they do not do |
|------|--------|------------------|----------------------------|---------------------|
| Services | `/services` | `page:services` to open. Mutations use `requireHairAuth` | Name, price, GST bps, duration, bookable, commission override, consumable kit + `deduct_inventory` | Do not rewrite old invoices |
| Products | `/products` | Layout key is `page:settings` | Name, price, type retail/professional, opening stock, brand | Type does not choose the stock movement |
| Memberships | `/memberships` | `page:memberships` | Name, tier, discount bps, price, validity days | Priority/birthday/multiplier are not applied at checkout |
| Packages | `/packages` | `page:packages` | Name, price, normal value, validity, included services and quantities | Editing a plan does not change credits already sold (UI copy on `PackagesUi`) |
| Staff | `/staff` | `page:staff` plus staff-management checks | Name, bookable flag, default commission type/percent/fixed, link to workforce employee | Does not by itself grant login |
| Permissions | `/settings/permissions` | Workforce permission management | Grant/revoke workforce keys | Does not edit the 16 legacy page keys in a separate matrix on this screen |
| Tax / GST | Service GST bps; `/settings/gst-invoice` for invoice identity | `page:settings` | Legal name / GSTIN fields on the invoice settings form. Per-line rate is on the service/product | No per-bill tax code picker |
| Discounts | No settings page | — | Line % and price override at sale time. Membership bps on the plan | No “today’s offer” object |
| Payment modes | Hard-coded `QUICK_SALE_PAYMENT_METHODS` = cash, upi, card. Wallet is a separate button | — | Not a salon setting | Bank and gift card are not POS chips |
| Salon information | `/settings/salon` | `page:settings` | Business name, address, Google review URL, default buffer minutes, timezone, weekly open/close | Review URL only adds a button on the success dialog |
| Locations | Platform admin `/platform/admin/locations` | Platform operator | Org locations for SaaS | Salon settings has chairs (`ResourcesPanel`), not a second-site transfer workflow |
| Invoice prefix / next number | `fyh_settings` via billing settings and `nextInvoiceNumber` | `page:settings` | Prefix and sequence | — |
| Billing flags | `/settings/billing` | `page:settings` | Defaults for mark due, full due, credit overpay | The cashier can still change them on the sale |
| Negative stock | `/settings/inventory` | `page:settings` | `allowNegativeStock` read by `applyMovement` | — |

### 20.13 Walk-in versus appointment — evidence

There is **no** table called walk-in and **no** third checkout.

| Code | Meaning |
|------|---------|
| `fyh_appointments.source = 'walk_in'` | Calendar checkbox. Creates a normal appointment, default status `arrived`, then **Raise Sale** → Express Sale → invoice `source = appointment` |
| `fyh_appointments.source = 'booking'` | Slot booking. Usually starts `booked`. Must be marked arrived before Raise Sale |
| `fyh_customers.source = 'walk_in'` | How the **person** was added (quick create). Not a visit |
| Invoice `source = 'quick_sale'` | Express Sale with no `appointmentId` |
| Invoice `source = 'appointment'` | Express Sale opened from Raise Sale |

A customer who walks in and is billed only from the 9-dot menu never gets an appointment row. **CURRENT BEHAVIOR.** Whether the desk should also book them is **BUSINESS DECISION REQUIRED**. The software supports both and does not force one.

### 20.14 Business workflow matrix

| Workflow | Current path | Source of truth | Status |
|----------|----------------|-----------------|--------|
| New customer | Express Sale or booking modal → `createCustomerQuick` (code `CL…`). CRM form → `createCustomer` (no code) | `fyh_customers` | **PARTIAL** |
| Existing customer | Search → select | `fyh_customers` | **IMPLEMENTED** |
| Walk-in | Either Express Sale with no appointment, or calendar Walk-in checkbox then Raise Sale | Invoice `source` `quick_sale` or `appointment` | **IMPLEMENTED** as two paths |
| Appointment | Calendar create → status changes → Raise Sale | `fyh_appointments` | **IMPLEMENTED** |
| Express Sale | 9-dot → `/quick-sale` → `checkoutFromBasket` | `fyh_invoices` | **IMPLEMENTED** |
| Product sale | Catalog line on the same bill | `fyh_invoice_lines.kind = product` | **IMPLEMENTED** |
| Service sale | Catalog line, staff required | `fyh_invoice_lines.kind = service` | **IMPLEMENTED** |
| Membership | Catalog line; entitlement after full pay | `fyh_customer_memberships` | **IMPLEMENTED** / benefits beyond % **NOT IMPLEMENTED** |
| Package | Buy on bill; redeem via Available Services | `fyh_customer_package_credits` | **IMPLEMENTED** |
| Partial payment | Mark as Due + some tender | Invoice `partial` + `receivable_open` | **IMPLEMENTED** |
| Full payment | Tenders cover total, or total is ₹0 | Invoice `paid` | **IMPLEMENTED** |
| Customer credit | Use credit, method `wallet` | Ledger `wallet_redemption` | **IMPLEMENTED** |
| Mark as Due | Flag, not a tender | Ledger `receivable_open` | **IMPLEMENTED** |
| Cancellation | Edit or Cancel → `cancelInvoice` → `void` | `fyh_invoices.status` | **PARTIAL** — financial caches ignore it; stock, commission, entitlements, appointment link do not reverse |
| Refund | — | `refunded` status and `fyh_credit_notes` unused | **NOT IMPLEMENTED** |
| Inventory deduction | `applyMovement` on full pay | `fyh_stock_movements` | **IMPLEMENTED** / reversal **NOT IMPLEMENTED** |
| Staff attribution | `buildAttributionPlan` at checkout | `fyh_invoice_line_attributions` | **IMPLEMENTED** |
| Commission | `evaluateCommissionsForInvoice` when `paidAt` is set; mark paid on `/loyalty` | `fyh_commission_entries` | **PARTIAL** — not fed into salary; not reversed on void |
| Customer history | Profile timeline + ledger + notes | `fyh_customer_timeline`, `fyh_financial_ledger` | **IMPLEMENTED** |

### 20.15 Inconsistencies and decisions

**Biggest inconsistencies (CURRENT BEHAVIOR, not a proposal):**

1. “Edit bill” voids the invoice and opens an empty Express Sale. It does not copy the old lines.
2. Void drops the bill out of revenue, dues, and wallet math, but leaves stock, commission, memberships, package credits, and `appointment.invoice_id` in place.
3. `planInvoiceCancellationLedger` is unused. Balances change by ignoring rows, not by posting reversals.
4. Two walk-in meanings: a customer source, and an appointment source.
5. CRM create does not assign `CL` codes. Quick create does.
6. Membership stores birthday, priority booking, and a points multiplier that checkout never reads.
7. Loyalty points are displayed and never written.
8. Refund and customer sales-return exist as schema or report labels without a writer.
9. Per-service staff on an appointment is notes text. The bill uses one staff id until the cashier changes lines in Express Sale.

**BUSINESS DECISION REQUIRED** (not answered by code):

1. Should every walk-in also be an appointment?
2. After a void, should stock, package credits, membership, commission, and Raise Sale be reversed?
3. Should “edit bill” copy the old basket, or is a blank new sale the intended correction?
4. Should customer credit and mark-as-due stay as opposite ledger meanings?
5. Should CRM-created customers get the same `CL` code as quick-created customers?
6. Are birthday / priority / points-multiplier membership fields still wanted, given they do nothing at checkout?
7. Is a points program wanted at all?
8. Is a cash refund or sales return wanted, or is void-without-restock the policy?

**UNKNOWN** from source alone: production rows in `fyh_credit_notes`; whether any invoice has `status = refunded`; live notification delivery.

*End of FYHAIR-REAL-WORKFLOW-AUDIT.md*

---

## 21. Revenue dashboard and expense module (2026-10-06)

This section records the implemented dashboard and expense rules. It does not replace §20.

### Confirmed product requirements

- Sales: Services, Packages, Products, Memberships. No Gift Card. Each row has quantity and final amount.
- Actual collection: Cash, Card, UPI/Online, Other, minus refunds. Other is a real tender that is not one of those three (today, bank). Wallet, gift card, membership credit, and unpaid dues are not collection.
- Advances remain the wallet/advance ledger.
- Refunds remain a separate widget.
- Dues: pending, paid/collected, total, for the selected branch and dates.
- Invoice month chart includes every month in the selected range, including empty months.
- Expense categories: Stock Purchase, Foods & Beverage, General, Maintenance, Bill, Other.
- Expense For: Guest, Vendor, Sales, Organization, Personal.
- Paid By: Salon (default), Staff, Owner, Other. Staff name required only for Staff.
- Payment mode: Cash, Card, UPI/Online.
- Date: today by default, past allowed, future rejected on the server.
- Note optional. Multiple attachments optional, including camera capture. File upload remains available.

### Existing implementation facts

- Refund execution, inventory restoration, membership-credit restoration, and commission reversal still have no writer. The refund widget reads `fyh_credit_notes`.
- Cancelled invoices are `status = void` and drop out of sales, month totals, and collection joins.
- Expense removal is soft cancel. Dashboard and list queries already exclude `cancelled`.

### Architecture decisions

- Sales use issued invoices (`paid`, `partial`, `unpaid`) by `createdAt`, excluding void, draft, refunded, and `advance_payment`.
- Line totals are scaled to the invoice grand total so category amounts sum to the bill.
- Collection total is the tender sum minus credit notes in the same range.
- Migration `0053_expense_dashboard_categories` remaps old category, payer, and payment strings. Salary is unchanged and still excluded from general expense totals.
- `fyh_expense_attachments` stores extra files. The first file is also written to `attachment_url`.

### TO BE DEFINED

- How a real refund restores stock, membership or package credit, and staff commission, and how that refund splits across the original tenders. Credit notes have no payment-method column today.
