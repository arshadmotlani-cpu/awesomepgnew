# Salon Software — Product Brain

> **Audit date:** 2026-10-04 · **Mode:** read-only architecture discovery (no code changes)  
> **Reference salon:** FYHAIR (For Your Hair) — first tenant on Salon Software on Hair host (`src/hair/*`, `app/(hair)/fyh/*`)  
> **Graphs:** [`FYHAIR-SALON-BRAIN.mermaid`](./FYHAIR-SALON-BRAIN.mermaid)  
> **Interactive map:** `/system-map` — use **Core Product** tab for product workshop (Hair host — internal architecture explorer)  
> **Core product model:** [`FYHAIR-CORE-PRODUCT-MODEL.md`](./FYHAIR-CORE-PRODUCT-MODEL.md)  
> **Ecosystem index:** [`FYTECH-MASTER-BRAIN.md`](./FYTECH-MASTER-BRAIN.md)  
> **Terminology:** [`TERMINOLOGY.md`](./TERMINOLOGY.md)

**Product name:** **Salon Software**. **FYHAIR** is the reference salon business and first tenant. Legacy marketing may use SOFT / For Your Hair; codebase paths use `hair`, `fyh`, `foryourhair`.

---

## Terminology (product vs reference salon)

| | |
|---|---|
| **COMPANY** | For Your Technologies |
| **PRODUCT** | Salon Software |
| **REFERENCE CUSTOMER / SALON** | FYHAIR (For Your Hair) |

- **FYHAIR existing implementation** — the live salon stack on the Hair host used by the FYHAIR organization today.  
- **Salon Software target SaaS product** — the same product line scaled to many salon organizations (see [`TERMINOLOGY.md`](./TERMINOLOGY.md)).

Do **not** describe FYHAIR as the name of the software product.


## 1. Executive architecture summary

**Salon Software** is a **Next.js salon operating system** in the Awesome PG monorepo, isolated by **host middleware** (`src/hair/lib/host.ts`) on dedicated Neon DB (`HAIR_DATABASE_URL`). It combines:

| Layer | Location | Role |
|-------|----------|------|
| **Salon tenant app** | `app/(hair)/fyh/(app)/*` | Day-to-day salon: CRM, calendar, POS, inventory, reports |
| **Salon services** | `src/hair/services/*`, `actions/*`, `domain/*` | Business logic (billing SSOT in domain checkout + `invoices.ts`) |
| **Workforce Engine** | `src/workforce/*` | HR, attendance, payroll ops, granular RBAC (`wf_*` in **same** Hair DB) |
| **Platform admin** | `app/(platform)/platform/admin/*`, `src/platform/*` | **Separate** Platform DB — orgs, plans, subscriptions, onboarding |
| **Legacy admin bridge** | `fyh_admin_users`, `page:*` permissions | Coexists with workforce; bridged via `hairAdminBridge.ts` |

**Constitution (ecosystem):** Salon intelligence is still **inside the Salon Engine** per [`docs/ECOSYSTEM_V2_INVENTORY.md`](../ECOSYSTEM_V2_INVENTORY.md) — a dedicated **Salon Brain** module is a **gap**; this document is the **product brain** for planning, not a runtime Brain service.

**Production posture today:** FYHAIR (reference salon) production is live on a single-org basis; **multi-tenant SaaS is scaffolded but unsafe** until `FYH_SAAS_TENANT=1` + migration parity + scoped catalog/checkout ([`docs/SAAS_READINESS.md`](../SAAS_READINESS.md)).

**Navigation SSOT:** [`src/hair/lib/nav.ts`](../src/hair/lib/nav.ts) — **no global “+ New” menu** in `HairAppHeader` (docs drift: only **9-dot Quick Actions** — Express Sale, Advance Payment, Add Expense).

---

## 2. Current product surfaces

| Surface | Host / path | Audience |
|---------|-------------|----------|
| Salon ERP | `fyhair.awesomepg.in`, `foryourhair.awesomepg.in` → `/fyh/*` routes | Salon staff |
| Platform admin | Platform routes `/platform/admin/*` | FYTECH operators |
| Public invoice | `/invoice/[n]`, `/i/[n]` | Customer share links |
| Marketing | `/salon-software`, `/subscribe`, `/brand-concepts` | Leads / waitlist |
| Workforce self-service | `/me`, `/workforce/home`, `/attendance` | Employees |

---

## 3. Feature inventory (salon tenant)

Status legend: **working** · **partial** · **placeholder** · **broken** · **unclear**

| ID | Name | Route(s) | Status | Notes |
|----|------|----------|--------|-------|
| F-01 | Revenue dashboard | `/dashboard/revenue` | working | `page:dashboard_revenue` |
| F-02 | Staff performance dashboard | `/dashboard/staff-performance` | working | Attribution-driven |
| F-03 | Front desk dashboard | `/dashboard/front-desk` | working | Limited nav profile |
| F-04 | Customers CRM | `/customers`, `/customers/[id]`, `/customers/new` | working | `fyh_customers` |
| F-05 | Appointments calendar | `/appointments` | working | DnD, modals, conflict checks |
| F-06 | Invoices register | `/billing/invoices`, `/billing/[id]` | working | |
| F-07 | Quick Sale POS | `/quick-sale` | working | Hidden from main nav; 9-dot launcher |
| F-08 | Advance payment | `/advance-payment` | working | Wallet credit, no invoice |
| F-09 | Staff management | `/staff`, `/staff/[id]` | partial | Workforce engine; schedule UI thin |
| F-10 | Attendance (self) | `/attendance` | working | Workforce |
| F-11 | Team attendance | `/attendance/manage` | working | Managers |
| F-12 | Attendance map | `/attendance/map` | partial | Geolocation evidence |
| F-13 | Purchases (ERP) | `/purchases` | working | `purchaseBrain` |
| F-14 | Purchases (legacy PO) | `/inventory/purchases` | partial | Duplicate UX path |
| F-15 | Vendors | `/vendors`, `/inventory/vendors` | partial | Dual paths |
| F-16 | Inventory stock | `/inventory/stock` | working | |
| F-17 | Stock movements | `/inventory/movements` | working | Read ledger |
| F-18 | Stock adjustments | `/inventory/adjustments` | working | |
| F-19 | On-floor stock | `/inventory/on-floor` | partial | Read-only; issue/return Phase 2 |
| F-20 | Inventory transfers | `/inventory/transfers` | placeholder | |
| F-21 | Expenses | `/expenses` | working | |
| F-22 | Salary expenses | `/expenses/salary` | working | Host-guarded |
| F-23 | Loyalty | `/loyalty` | partial | No plan CRUD UI (UAT-M7) |
| F-24 | Memberships config | `/memberships` | working | |
| F-25 | Packages config | `/packages`, `/membership-packages` | working | |
| F-26 | Services catalog | `/services` | working | 18% GST fixed; categories migration |
| F-27 | Products catalog | `/products` | working | Settings permission for products |
| F-28 | Reports hub | `/reports/*` | partial | Many reports live; some placeholders |
| F-29 | Settings | `/settings/*` | working | Salon, GST, printer, permissions, import |
| F-30 | Historical import | `/settings/historical-import` | working | Super-admin |
| F-31 | Global search | header | working | `api/search` |
| F-32 | Public invoice view | `/invoice/[n]` | working | Tenant isolation risk if 0036 applied |
| F-33 | Profile | `/profile` | working | Exempt from page permission map |
| F-34 | Platform team invites | `/team` | working | **Platform** memberships, not `fyh_staff` |
| F-35 | Workforce operations | `/workforce/operations` | partial | Payroll/schedules ops |
| F-36 | Employee portal | `/me` | working | `WORKFORCE_ENGINE` |
| F-37 | Hold bills | Quick Sale | working | Draft `HOLD-*` invoices |
| F-38 | Invoice cancellation / correction | billing UI | working | `invoiceCancellation` |
| F-39 | Commission rules schema | DB only | placeholder | `commissionEngine.ts` no-op |
| F-40 | Notifications outbox | loyalty UI panel | partial | Process stub (UAT-M13) |
| F-41 | Gift cards | payment layer | broken | Blocked at pay (UAT-M12) |
| F-42 | Package redemption at checkout | Quick Sale | partial | **Next phase** per FEATURES.md |
| F-43 | Membership consumption at checkout | Quick Sale | partial | **Next phase** |
| F-44 | Retail stock on Quick Sale pay | Quick Sale | partial | **Next phase**; appointment path consumes |
| F-45 | Chair/resource admin UI | — | partial | DB/seed only (UAT-M2) |
| F-46 | Forgot password | login | broken | Placeholder link (UAT-M14) |
| F-47 | SaaS org picker | `/select-organization` | partial | Flag-gated |
| F-48 | Waitlist signup | `/salon-software` | working | Isolated `saas_waitlist_signups` |
| F-49 | Vendor ledger / payments | vendors UI | working | `vendorBrain`, PDF statement API |
| F-50 | GST reports | `/reports/finance/gst` | working | |
| F-51 | Commission pay action | workforce | partial | `action:staff.commission_pay` |
| F-52 | Express Sale launcher | 9-dot menu | working | **Not** “+ New” global menu |

**Feature count:** **52** inventoried surfaces/modules.

---

## 4. Platform administration features (separate product layer)

| ID | Name | Route | Status |
|----|------|-------|--------|
| P-01 | Platform overview | `/platform/admin` | working |
| P-02 | Organizations | `/platform/admin/organizations` | working |
| P-03 | Locations | `/platform/admin/locations` | working |
| P-04 | Users | `/platform/admin/users` | working |
| P-05 | Subscriptions | `/platform/admin/subscriptions` | working |
| P-06 | Plans | `/platform/admin/plans` | working |
| P-07 | Manual payment submissions | `/platform/admin/payment-submissions` | working |
| P-08 | Onboarding | `/platform/admin/onboarding` | working |
| P-09 | Activity | `/platform/admin/activity` | working |
| P-10 | Search | `/platform/admin/search` | working |
| P-11 | Accept invite | `/platform/auth/accept-invite` | working |
| P-12 | Stripe webhook | `/api/platform/stripe/webhook` | working |

Nav SSOT: `src/platform/lib/platformNav.ts`.

---

## 5. Roles (actors)

### 5.1 Platform (FYTECH) level

| Role | Source | Scope |
|------|--------|-------|
| Platform admin | `platform.users` + lifecycle | All orgs |
| Organization member roles | `platform.memberships.role` | Per org |

**Platform membership roles (code):** `owner`, `co_owner`, `manager`, `receptionist`, `biller`, `staff` — labels in `src/platform/lib/tenantAccessRoles.ts`.

### 5.2 Salon tenant level

| Role / identity | Store | Used for |
|-----------------|-------|----------|
| `super_admin` / `admin` | `fyh_admin_users` | Legacy salon admin + `page:*` permissions |
| Workforce `job_role` | `wf_engine_memberships` | owner, manager, receptionist, biller, staff (+ legacy stylist mappings) |
| Operational stylist | `fyh_staff` | Appointment FKs, attribution |
| Authenticated employee | `wf_employees` | Login, attendance, `/me` |
| Front desk profile | Permission set | Billing without settings/reports/inventory |

**Role count (distinct role concepts):** **12** (6 platform + 2 legacy admin + 4 workforce job roles; operational staff is not a login role).

**TO BE DEFINED:** Formal mapping of “Business Owner” label → `owner` vs `super_admin` vs Platform `owner`.

---

## 6. Permissions

| System | Keys | Enforcement |
|--------|------|-------------|
| Legacy Hair | 16 `page:*` + 7 `action:*` | Layout `pagePermissionForPath`, most actions |
| Workforce | 67 boolean keys | `requireFyhPermission`, workforce actions |
| Bridge | `hairAdminBridge.ts` | Workforce → legacy nav (**lossy**) |

**Gap:** ~48 `src/hair/services/*` modules **without** auth checks ([`docs/foryourhair/RBAC_AUDIT.md`](../foryourhair/RBAC_AUDIT.md)).

**Weak routes:** `/staff`, `/team`, `/workforce` use `page:dashboard` at layout level — rely on action-level guards.

---

## 7. Data model (entities)

**Hair DB:** ~54 `fyh_*` tables + ~13 `wf_*` (Workforce) per Phase 0A audit. **Platform DB:** orgs, locations, users, memberships, plans, subscriptions (separate).

### 7.1 Core entities (salon)

| Entity | Table(s) | Tenant column | Location scope |
|--------|----------|---------------|----------------|
| Customer | `fyh_customers` | org | org-level |
| Appointment | `fyh_appointments`, `fyh_appointment_services` | org + location | location |
| Invoice | `fyh_invoices`, lines, payments, credit notes | org + location | location |
| Service | `fyh_services`, categories | org | org |
| Product | `fyh_products`, brands | org | org |
| Staff (ops) | `fyh_staff`, schedules | org | org + staff_locations |
| Stock | `fyh_stock_movements`, location_stock | org + location | location |
| Vendor / PO | `fyh_vendors`, PO, GRN, adjustments | org | org |
| Purchase (ERP) | purchase brain tables | org | org |
| Membership | plans, customer_memberships | org | org |
| Package | plans, credits | org | org |
| Loyalty | points/history tables | org | org |
| Expense | `fyh_expenses` | org + location | location |
| Attribution | `fyh_invoice_line_attributions` | org | location |
| Commission | entries, rules | org | org |
| Ledger | `fyh_financial_ledger` | org | org |
| Notifications | templates, outbox | org | org |
| Settings | `fyh_settings` | org | org |

**Entity count (salon operational tables):** **~67** (including workforce).

### 7.2 Platform entities (not in Hair DB)

Organization, Location, Platform User, Membership, Plan, Subscription, Entitlement, Invitation, Manual payment submission — `src/platform/db/schema/*`.

---

## 8. Business rules (authoritative where documented)

| ID | Rule | Source |
|----|------|--------|
| BR-01 | Invoice checkout SSOT = `checkoutFromBasket` | `domain/checkout/pipeline.ts` |
| BR-02 | Basket pricing = `priceBasket` | `domain/basket/engine.ts` |
| BR-03 | Display payment status = `summarizeInvoiceSettlement` | `invoiceSettlement.ts` |
| BR-04 | Staff performance = attributions on paid invoices | `fyh_invoice_line_attributions` |
| BR-05 | Service GST default 18% (1800 bps) | services schema / FEATURES.md |
| BR-06 | Quick Sale source tag on invoices | FEATURES.md |
| BR-07 | Hold bills: draft + `HOLD-*` until checkout | migration 0014 |
| BR-08 | Appointment checkout → build basket → Quick Sale URL | `appointments.ts` |
| BR-09 | Stock mutations SSOT = `applyMovement` | `services/stock.ts` |
| BR-10 | Tenant filters no-op unless `FYH_SAAS_TENANT=1` | `tenant/filters.ts` |
| BR-11 | Front desk nav when billing without settings | `isFrontDeskNavProfile` |
| BR-12 | Super admin = all permissions | `permissionTypes.ts` |
| BR-13 | Invoice numbers per-org when SaaS sequences enabled | `saas.ts` |
| BR-14 | Legacy service commission dual-write | `applyLegacyServiceCommission` |
| BR-15 | Consumable deduct on pay when `deductInventory` true | fixed UAT-C1 |
| BR-16 | Dashboard staff-on-schedule KPI uses salon TZ | fixed UAT-C2 |
| BR-17 | Configuration group: services, products, memberships, packages only | `nav.ts` |
| BR-18 | Workforce engine id `fyh_salon` | `workforce/types.ts` |
| BR-19 | Owner salon bootstrap slug `for-your-hair` | `ownerSalonTenant.ts` |
| BR-20 | Public hosts bypass PG middleware | `middleware.ts` |

**Business rule count:** **20** explicitly traced (many more implicit in services).

---

## 9. Workflows (as implemented)

### Customer → pay

`fyh_customers` → `fyh_appointments` (optional) → `buildBasketFromAppointment` or Quick Sale catalog → `checkoutFromBasket` → `fyh_invoices` + lines → `recordInvoicePayments` → attributions + ledger + commission + (appointment) stock consumables.

### Appointment lifecycle

Create/reschedule/cancel/no-show in `services/appointments.ts`; conflict detection; status transitions; checkout redirects to Quick Sale.

### Membership / package

Configuration live; **sale** on Quick Sale pay; **redemption/consumption at checkout** — next phase ([`docs/foryourhair/FEATURES.md`](../foryourhair/FEATURES.md)).

### Inventory

Products + vendors + purchases post stock via `applyMovement`; service consumables on **appointment pay** path; Quick Sale retail deduction **not** live; transfers UI placeholder.

### Workforce

Hire/link `wf_employees` ↔ `fyh_staff`; schedules/attendance/payroll ops; permissions gate sensitive actions; `/team` manages **Platform** invites.

---

## 10. Integrations

| Integration | Status |
|-------------|--------|
| Stripe (Platform subscriptions) | working — Platform webhook |
| WhatsApp / SMS notifications | **TO BE DEFINED** — outbox stub |
| Printer / PDF invoice | working — print API routes |
| Geocoding office | `api/office-location/geocode` |
| Razorpay | **Not** in Hair billing path (Platform SaaS phase E tests assert no Razorpay touch) |

---

## 11. Cron / background

**No Hair-specific `app/api/cron` jobs.** PG cron routes only.

Hair notification processing: **manual** actions (`processOutboxBatchAction`) — not scheduled.

CI: scheduled Hair E2E workflow (`.github/workflows/hair-e2e.yml`).

---

## 12. Notifications

Schema: `fyh_notification_templates`, `fyh_notification_outbox`.  
Delivery: **incomplete** (UAT-M13) — batch processor stub, no WhatsApp adapter wired.

---

## 13. Billing architecture

**Authoritative write path:** `checkoutFromBasket` → `services/invoices.ts` (numbers, payments, side effects).

**Display / status:** `summarizeInvoiceSettlement`, `displayInvoiceStatus`.

**Duplication risk areas:** Legacy commission vs attribution; multiple report queries vs attributions; hold bill rehydration in `quickSaleHold.ts`.

**Not authoritative alone:** Raw line totals for staff reports (use attributions).

**Gift cards:** blocked at payment layer.

---

## 14. Inventory architecture

**Types in use:** Retail products, service consumables (BOM on services), vendor purchases, floor stock tracking (read-only UI), ERP purchase records.

**Dual paths:** `/purchases` (ERP) vs `/inventory/purchases` (legacy PO) — architectural footgun.

**TO BE DEFINED:** Whether retail Quick Sale should always decrement same SKU ledger as appointment consumables (next phase).

---

## 15. Multi-tenant architecture

- Mirror IDs: `organization_id`, `location_id`, `user_id` on Hair rows (`tenantColumns.ts`).
- Enforcement: **`FYH_SAAS_TENANT`** opt-in filters; default **single salon**.
- Platform DB holds truth for org/membership; **no FK** to Hair DB.
- **Unsafe for 2nd salon** without full cutover ([`docs/SAAS_READINESS.md`](../SAAS_READINESS.md)).
- Migration drift: SQL `0037` not in journal; Drizzle vs `0036` unique index mismatch.

---

## 16. Multi-location architecture

- `location_id` on appointments, invoices, stock, expenses, schedules, attendance.
- `fyh_staff_locations`, `fyh_location_stock` when SaaS enabled.
- Org picker + cookies: `fyh_org_id`, location cookie.
- Transfers module **not** implemented.

---

## 17. Known issues / architectural debt

See **Section 19** for ISSUE-ID list. Summary categories: SaaS isolation, RBAC gaps, dual permission systems, dual inventory UIs, notification stub, doc drift (“+ New”), report TZ edge cases, test flake FYH-TEST-01.

---

## 18. Historical fixes (do not treat as open)

| Fix | Issue | Evidence |
|-----|-------|----------|
| Service consumable `deductInventory` preserved on save | UAT-C1 | `serviceConsumablesPreserve.test.ts` |
| Dashboard staff-on-schedule KPI | UAT-C2 | UAT_AUDIT Phase 1 |
| Quick Sale hold bills | — | migration 0014, FEATURES.md |

---

## 19. KNOWN PROBLEMS / ARCHITECTURAL DEBT

| ISSUE-ID | Problem | Root cause | Affected nodes | Current state | Known fix | Remaining risk | Priority |
|----------|---------|------------|----------------|---------------|-----------|----------------|----------|
| ISS-01 | Multi-tenant data leak | `orgFilter` no-op when flag off; nullable org | All modules | Open for SaaS | Enable `FYH_SAAS_TENANT` + 0037 + scoped services | High until cutover | **critical** |
| ISS-02 | Public invoice cross-tenant read | Invoice number unique per org after 0036; lookup by number alone | F-32, billing | Open if 0036 applied | Scope public lookup by org token | Data exposure | **critical** |
| ISS-03 | Catalog unscoped | `loadBillableCatalog` no org filter | Quick Sale, appointments | Open | Add orgFilter to adapter | Wrong prices/items | **high** |
| ISS-04 | Services layer unguarded | Auth only on actions/routes | All services | Open | Middleware or service guards | Privilege escalation | **high** |
| ISS-05 | Dual RBAC systems | Legacy + workforce + lossy bridge | Nav, actions | Partial | Consolidate on workforce keys | Wrong access | **high** |
| ISS-06 | Dual purchase/vendor UIs | Parallel ERP and legacy paths | F-13–F-15 | Open | Unify routes | Operator error | **medium** |
| ISS-07 | Notifications not delivered | Outbox processor stub | F-40 | Open | Wire WhatsApp/SMS | No reminders | **medium** |
| ISS-08 | Gift card payments fail | Blocked in payment layer | Billing | Broken | Implement or remove UI | Lost sales | **medium** |
| ISS-09 | Forgot password dead | Login placeholder | Auth | Broken | Platform reset flow | Support burden | **medium** |
| ISS-10 | Package/membership redemption | Not implemented at checkout | F-42, F-43 | Partial | Next phase FEATURES | Manual workarounds | **medium** |
| ISS-11 | Quick Sale retail stock | Not deducted on pay | F-44 | Partial | Next phase | Inventory drift | **medium** |
| ISS-12 | Inventory transfers placeholder | Not built | F-20 | Placeholder | Multi-location design | Manual transfers | **low** |
| ISS-13 | Chair/resource admin UI missing | Seed/DB only | F-45 | Partial | Admin UI | Config in DB only | **low** |
| ISS-14 | Loyalty plan CRUD UI missing | Seed/DB only | F-23 | Partial | Admin UI | Ops via SQL | **low** |
| ISS-15 | Report week/month TZ | Server midnight vs salon bounds | F-28 | Partial | Unify `salonDayBounds` | Off-by-one reports | **medium** |
| ISS-16 | No Hair cron | SaaS ops undefined | Notifications, subs | Open | Define cron or queue | Manual ops | **medium** |
| ISS-17 | Doc “+ New” menu | Docs outdated | UX docs | Doc drift only | Update docs | Confusion | **low** |
| ISS-18 | `rcVisitLoop` flake | Shared seed contention | Tests | Intermittent | Isolate test data | CI noise | **low** |
| ISS-19 | Migration journal drift | 0037 not journaled | DB | Unclear prod | Introspect + journal | NOT NULL not applied | **high** |
| ISS-20 | Drizzle vs 0036 uniques | Schema declares global uniques | Invoices, customers | Unclear prod | Align Drizzle | Migration fail / wrong uniques | **high** |
| ISS-21 | Commission engine no-op | Scaffold only | F-39 | Placeholder | Build engine | Legacy commission only | **low** |
| ISS-22 | Weak staff route guard | `page:dashboard` only | F-09 | Partial | Tighten layout guard | URL probing | **medium** |
| ISS-23 | `/team` vs workforce confusion | Platform vs HR | F-34 | Working as designed | Document | Wrong module | **low** |
| ISS-24 | SaaS waitlist no auth | Public signup | F-48 | Working | Rate limit / captcha TO BE DEFINED | Spam | **low** |
| ISS-25 | Tenant mirror tables | Documented but not in Drizzle | SaaS | Not implemented | Phase 0B | Reconcile drift | **medium** |

**Known issue count:** **25** recorded.

---

## 20. TO BE DEFINED decisions

| ID | Topic |
|----|--------|
| TBD-01 | Production status of migrations 0036 / 0037 on Hair Neon |
| TBD-02 | Cutover date for `FYH_SAAS_TENANT=1` on production |
| TBD-03 | Public invoice URL format with org scoping |
| TBD-04 | Single purchase UX canonical route |
| TBD-05 | Salon Brain runtime module vs this product brain doc |
| TBD-06 | Gift card product scope (remove vs implement) |
| TBD-07 | Notification channel priority (WhatsApp vs SMS) |
| TBD-08 | Multi-location transfer workflow |
| TBD-09 | Commission engine vs attribution-only future |
| TBD-10 | Retail vs consumable stock SKU policy on Quick Sale |
| TBD-11 | Whether `co_owner` maps to workforce role |
| TBD-12 | External salon self-serve signup flow post-SaaS |

**TO BE DEFINED count:** **12**.

---

## 21. Dependency map (change safety)

| If you change… | Review also… |
|----------------|--------------|
| **Billing / `checkoutFromBasket`** | Invoices, payments, attributions, ledger, commission, reports, stock on pay, wallet/advance, public invoice |
| **Attributions** | Staff performance, commission reports, payroll exports |
| **Tenant filters** | Every query in services, catalog adapter, checkout, ledger, public routes |
| **Workforce permissions** | hairAdminBridge, nav, Quick Sale, appointments bookable list |
| **Appointments** | Quick Sale checkout, stock consumables, resources, schedules |
| **Services catalog** | Appointments, Quick Sale, consumables, GST reports |
| **Inventory / stock** | Products, purchases, appointments pay, reports |
| **Platform org/location** | TenantContext, sequences, team page, subscription gates |
| **Invoice numbering** | Public share links, SaaS uniqueness |

Full graph: [`FYHAIR-SALON-BRAIN.mermaid`](./FYHAIR-SALON-BRAIN.mermaid).

---

## 22. Recommended order for future changes

1. **Production introspection** — confirm 0036/0037 + Drizzle parity (blocks SaaS).  
2. **Tenant enforcement** — flag, NOT NULL, catalog + checkout scoping, public invoice.  
3. **RBAC consolidation** — workforce keys end-to-end; service-layer guards.  
4. **Inventory UX unification** — one purchase/vendor path.  
5. **Billing next phase** — Quick Sale stock, package/membership redemption (FEATURES.md).  
6. **Notifications** — real adapter + optional cron.  
7. **Salon Brain extraction** — move report projections off duplicated SQL (ecosystem constitution).

---

## 23. Trace template (for future features)

```text
SCREEN → Server Action → Service / domain → DB tables → side effects (ledger, stock, outbox) → related modules
```

Example — Quick Sale pay:

`/quick-sale` → `quickSale.ts` actions → `checkoutFromBasket` → `fyh_invoices` + lines + payments + attributions → ledger, commission, (optional) stock → reports, staff performance.

---

## 24. What could not be determined from repository alone

- Exact **production** migration state (0036, 0037, unique indexes) without live introspection.  
- **Live** Stripe/subscription state per org.  
- **Browser** UAT matrix execution (documented as not run in UAT_AUDIT).  
- **Performance** baselines under load.  
- **Complete** list of seeded vs operator-created loyalty plans in prod.

Use: `npm run hair:db:introspect`, Platform admin, and [`scripts/cert-*`](../foryourhair/) read-only certs where present.

---

## References

| Doc | Topic |
|-----|--------|
| [`docs/foryourhair/FEATURES.md`](../foryourhair/FEATURES.md) | Quick Sale, attribution, phases |
| [`docs/foryourhair/RBAC_AUDIT.md`](../foryourhair/RBAC_AUDIT.md) | Permissions |
| [`docs/foryourhair/UAT_AUDIT.md`](../foryourhair/UAT_AUDIT.md) | UX/issues |
| [`docs/foryourhair/PHASE_0A_SAAS_AUDIT.md`](../foryourhair/PHASE_0A_SAAS_AUDIT.md) | SaaS baseline |
| [`docs/SAAS_READINESS.md`](../SAAS_READINESS.md) | Multi-tenant blunt assessment |
| [`docs/foryourhair/QUICK_SALE_ARCHITECTURE.md`](../foryourhair/QUICK_SALE_ARCHITECTURE.md) | POS design |
| [`docs/BUGS.md`](../BUGS.md) | FYH-TEST-01 flake |

---

## Forensic workflow audit (2026-10-04)

See [`FYHAIR-REAL-WORKFLOW-AUDIT.md`](./FYHAIR-REAL-WORKFLOW-AUDIT.md) and [`FYHAIR-REAL-WORKFLOW-GRAPH.mermaid`](./FYHAIR-REAL-WORKFLOW-GRAPH.mermaid).

**Proven corrections vs prior docs:**

- Quick Sale **retail + consumable inventory** deduction on paid checkout runs via `applyPaidSideEffects` → `applyInventorySideEffects` for `source=quick_sale` (verify against FEATURES.md “next phase” — code wins).
- **Hold bill create** button lives only in unused `QuickSaleCheckoutColumn`; compact `QuickSaleShell` exposes **resume held bills** on customer step but not hold submit in UI (tests confirm column not mounted).
- Express Sale entry: **9-dot Express Sale** primary; nav Quick Sale link hidden.

### Continued forensic pass (appended 2026-10-04, §20 of the workflow audit)

Detail: [`FYHAIR-REAL-WORKFLOW-AUDIT.md`](./FYHAIR-REAL-WORKFLOW-AUDIT.md) §20.

- **Customer credit** (`wallet` / `wallet_redemption`) spends an existing advance. **Mark as Due** (`receivable_open`) records money still owed. They are opposite ledger entries.
- **Edit bill and Cancel bill both void** the invoice (`cancelInvoice`). Edit then opens an empty `/quick-sale`. Lines, stock, commission, package credits, and `appointment.invoice_id` are not reversed. `planInvoiceCancellationLedger` is never called.
- Refund status and `fyh_credit_notes` have no application writer.
- Loyalty points have no writer. Membership checkout uses `discount_bps` only. Priority booking, birthday text, and `reward_multiplier_bps` are stored and unread.
- Quick-create customers get `CL` + 8 digits. `/customers/new` → `createCustomer` does not assign that code.
- Walk-in is either an appointment `source = walk_in` or an Express Sale with no appointment. There is no third workflow.
- Raise Sale redirects to `/quick-sale?appointmentId=` and does not insert the invoice. Stock and commission run only when the invoice is fully paid or the total is ₹0.

### Revenue dashboard and expenses (2026-10-06)

**Confirmed product requirements**

- Sales categories are Services, Packages, Products, Memberships. Gift cards are not a sales category.
- Sales amount is the invoice grand total, allocated across those line kinds. Quantity is the line quantity.
- Actual collection is cash, card, UPI/online, and other real tenders, minus credit-note refunds. Wallet, gift card, membership credit, and unpaid dues are not new cash.
- Advances stay on the existing wallet/advance ledger and are separate from membership credit.
- Dues show pending, collected, and total for the selected range.
- Invoice chart is every month in the selected range: count, invoice amount, discount, average bill value.
- Expense categories are exactly Stock Purchase, Foods & Beverage, General, Maintenance, Bill, Other.
- Expense For is Guest, Vendor, Sales, Organization, Personal.
- Expense Paid By is Salon (default), Staff, Owner, Other. Staff name is required only when Paid By is Staff.
- Expense payment mode is Cash, Card, UPI/Online. Note and attachments are optional. Future expense dates are rejected. Past dates are allowed.
- Attachments may be multiple files, including a device camera photo. Camera is not the only way to attach.

**Existing implementation facts**

- There is still no refund writer. Credit notes (`fyh_credit_notes`) are the only refund total the dashboard can read. Void is still the cancel path and does not restore stock, membership credit, or commission.
- Expense delete is the existing soft cancel (`status = cancelled`). Purchase-linked expenses stay blocked from manual edit/cancel.
- Expense list branch scope is the existing tenant location filter. The revenue dashboard also accepts a `locations` query.
- Permissions stay `page:dashboard_revenue` and `expenses.general.view|add|edit`. Cancel uses edit. There is no second permission system.

**Architecture decisions**

- Issued sale invoices (`paid`, `partial`, `unpaid`, not void, not draft, not `advance_payment`) are counted by `createdAt`. Tips, direct cost, and redemption stay on paid invoices by `paidAt`.
- Category money is scaled so recognized lines sum to the invoice grand total.
- Bank tender is Other. `online` maps to UPI. Wallet and gift card are ignored in collection.
- Legacy expense values are remapped in migration `0053_expense_dashboard_categories`: `inventory_purchase` → stock purchase, `food_pantry` → foods & beverage, utilities/rent/taxes → bill, vendor/marketing/travel/equipment → other. Salary stays salary and stays out of the general expense total. `business_cash` → salon, `petty_cash` payer → other, `online` payment → upi.
- Extra files live in `fyh_expense_attachments`. The first file is also stored on `fyh_expenses.attachment_url`.

**TO BE DEFINED**

- Refund dashboard split by original tender, and restoration of inventory, membership credit, and staff commission. No writer exists yet.
