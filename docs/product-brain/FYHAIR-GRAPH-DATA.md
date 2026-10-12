# FYHAIR — Machine-Readable Graph Inventory

> Companion to [`FYHAIR-COMPLETE-AUDIT.md`](./FYHAIR-COMPLETE-AUDIT.md) · Audit date 2026-10-04  
> **Terminology:** [`TERMINOLOGY.md`](./TERMINOLOGY.md) — COMPANY = For Your Technologies; PRODUCT = Salon Software; FYHAIR = reference salon (not product name).  
> **Core Product Workshop:** System Map → **Core Product** tab (CP-01…CP-25 product areas; not NODE-IDs in this file).  
> **Browser visualizer:** loads this file + audit at `/system-map` (see `src/hair/system-map/loadGraph.ts`)

## NODE FORMAT

```text
NODE-ID | NODE-TYPE | NAME | DESCRIPTION | PARENT | ROUTE | TABLE | ROLE | STATUS
```

## EDGE FORMAT

```text
FROM | RELATION | TO | DESCRIPTION | SOURCE FILE
```

---

## NODES — Core architecture

| NODE-ID | TYPE | NAME | DESCRIPTION | PARENT | ROUTE | TABLE | ROLE | STATUS |
|---------|------|------|-------------|--------|-------|-------|------|--------|
| N-ROOT | ROOT | FYTECH Monorepo | Awesome PG deployment |  |  |  |  |  |
| N-PLAT-001 | PRODUCT | FYTECH Platform | Org/subscription admin | N-ROOT |  | platform.* | platform admin | working |
| N-SALON-001 | PRODUCT | Salon Software (Hair runtime) | Implementation stack: salon ERP + workforce in Hair DB; FYHAIR org is reference tenant — NODE-ID legacy | N-ROOT |  | fyh_* + wf_* | salon staff | working |
| N-HOST | MODULE | Hair host detection | host.ts allowlist | N-SALON-001 |  |  |  | working |
| N-DOM-BASKET | DOMAIN | priceBasket | Basket pricing SSOT | N-SALON-001 |  |  |  | working |
| N-DOM-CHECKOUT | DOMAIN | checkoutFromBasket | Billing write SSOT | N-DOM-BASKET |  | fyh_invoices |  | working |
| N-SVC-INV | SERVICE | invoices.ts | Invoice persistence + side effects | N-DOM-CHECKOUT |  |  |  | working |
| N-SVC-STOCK | SERVICE | applyMovement | Stock mutation SSOT | N-SALON-001 |  | fyh_stock_movements |  | working |
| N-SVC-APT | SERVICE | appointments.ts | Appointment lifecycle | N-SALON-001 |  | fyh_appointments |  | working |
| N-SVC-CAT | SERVICE | loadBillableCatalog | Catalog adapter (unscoped risk) | N-SALON-001 |  |  |  | partial |
| N-ACT-QS | ACTION | quickSale.ts | Quick Sale actions | N-SALON-001 |  |  |  | working |
| N-ACT-APT | ACTION | appointments.ts | Appointment actions | N-SALON-001 |  |  |  | working |
| N-RBAC-LEG | MODULE | Legacy RBAC | page:* keys | N-SALON-001 |  |  |  | working |
| N-RBAC-WF | MODULE | Workforce RBAC | 67 keys | N-SALON-001 |  | wf_permission_grants |  | working |
| N-RBAC-BRIDGE | MODULE | hairAdminBridge | Lossy map | N-RBAC-WF |  |  |  | partial |
| N-TENANT-001 | MODULE | TenantContext | Org/location cookies + resolve | N-SALON-001 |  |  |  | partial |
| N-FLAG-SAAS | CONFIG | FYH_SAAS_TENANT | Tenant filter flag | N-TENANT-001 |  |  |  | partial |

## NODES — Surfaces (from Part 2)

| NODE-ID | TYPE | NAME | DESCRIPTION | PARENT | ROUTE | TABLE | ROLE | STATUS |
|---------|------|------|-------------|--------|-------|-------|------|--------|
| S-001 | SURFACE | Revenue dashboard | Salon/platform surface | N-SALON-001 | /dashboard/revenue | | | see Part 2 |
| S-002 | SURFACE | Staff performance dashboard | Salon/platform surface | N-SALON-001 | /dashboard/staff-performance | | | see Part 2 |
| S-003 | SURFACE | Front desk dashboard | Salon/platform surface | N-SALON-001 | /dashboard/front-desk | | | see Part 2 |
| S-004 | SURFACE | Dashboard redirect | Salon/platform surface | N-SALON-001 | /dashboard | | | see Part 2 |
| S-005 | SURFACE | Landing (post-login) | Salon/platform surface | N-SALON-001 | /landing | | | see Part 2 |
| S-006 | SURFACE | Customers list | Salon/platform surface | N-SALON-001 | /customers | | | see Part 2 |
| S-007 | SURFACE | Customer detail | Salon/platform surface | N-SALON-001 | /customers/[id] | | | see Part 2 |
| S-008 | SURFACE | New customer | Salon/platform surface | N-SALON-001 | /customers/new | | | see Part 2 |
| S-009 | SURFACE | Appointments calendar | Salon/platform surface | N-SALON-001 | /appointments | | | see Part 2 |
| S-010 | SURFACE | Billing hub | Salon/platform surface | N-SALON-001 | /billing | | | see Part 2 |
| S-011 | SURFACE | Invoice register | Salon/platform surface | N-SALON-001 | /billing/invoices | | | see Part 2 |
| S-012 | SURFACE | Invoice detail | Salon/platform surface | N-SALON-001 | /billing/[invoiceId] | | | see Part 2 |
| S-013 | SURFACE | Quick Sale POS | Salon/platform surface | N-SALON-001 | /quick-sale | | | see Part 2 |
| S-014 | SURFACE | Advance payment | Salon/platform surface | N-SALON-001 | /advance-payment | | | see Part 2 |
| S-015 | SURFACE | Staff roster | Salon/platform surface | N-SALON-001 | /staff | | | see Part 2 |
| S-016 | SURFACE | Staff detail (legacy id) | Salon/platform surface | N-SALON-001 | /staff/[employeeId] | | | see Part 2 |
| S-017 | SURFACE | Staff performance (per staff) | Salon/platform surface | N-SALON-001 | /staff/[id]/performance | | | see Part 2 |
| S-018 | SURFACE | Staff performance hub | Salon/platform surface | N-SALON-001 | /staff/performance | | | see Part 2 |
| S-019 | SURFACE | Self attendance | Salon/platform surface | N-SALON-001 | /attendance | | | see Part 2 |
| S-020 | SURFACE | Team attendance manage | Salon/platform surface | N-SALON-001 | /attendance/manage | | | see Part 2 |
| S-021 | SURFACE | Attendance map | Salon/platform surface | N-SALON-001 | /attendance/map | | | see Part 2 |
| S-022 | SURFACE | Purchases ERP | Salon/platform surface | N-SALON-001 | /purchases | | | see Part 2 |
| S-023 | SURFACE | New purchase ERP | Salon/platform surface | N-SALON-001 | /purchases/new | | | see Part 2 |
| S-024 | SURFACE | Purchase detail ERP | Salon/platform surface | N-SALON-001 | /purchases/[id] | | | see Part 2 |
| S-025 | SURFACE | Purchase edit ERP | Salon/platform surface | N-SALON-001 | /purchases/[id]/edit | | | see Part 2 |
| S-026 | SURFACE | Expenses | Salon/platform surface | N-SALON-001 | /expenses | | | see Part 2 |
| S-027 | SURFACE | Salary expenses | Salon/platform surface | N-SALON-001 | /expenses/salary | | | see Part 2 |
| S-028 | SURFACE | Loyalty hub | Salon/platform surface | N-SALON-001 | /loyalty | | | see Part 2 |
| S-029 | SURFACE | Memberships config | Salon/platform surface | N-SALON-001 | /memberships | | | see Part 2 |
| S-030 | SURFACE | Packages config | Salon/platform surface | N-SALON-001 | /packages | | | see Part 2 |
| S-031 | SURFACE | Membership-packages alias | Salon/platform surface | N-SALON-001 | /membership-packages | | | see Part 2 |
| S-032 | SURFACE | Services catalog | Salon/platform surface | N-SALON-001 | /services | | | see Part 2 |
| S-033 | SURFACE | Service detail | Salon/platform surface | N-SALON-001 | /services/[id] | | | see Part 2 |
| S-034 | SURFACE | New service | Salon/platform surface | N-SALON-001 | /services/new | | | see Part 2 |
| S-035 | SURFACE | Products catalog | Salon/platform surface | N-SALON-001 | /products | | | see Part 2 |
| S-036 | SURFACE | Product detail | Salon/platform surface | N-SALON-001 | /products/[id] | | | see Part 2 |
| S-037 | SURFACE | New product | Salon/platform surface | N-SALON-001 | /products/new | | | see Part 2 |
| S-038 | SURFACE | Reports overview | Salon/platform surface | N-SALON-001 | /reports | | | see Part 2 |
| S-039 | SURFACE | Daily revenue report | Salon/platform surface | N-SALON-001 | /reports/revenue/daily | | | see Part 2 |
| S-040 | SURFACE | Monthly revenue report | Salon/platform surface | N-SALON-001 | /reports/revenue/monthly | | | see Part 2 |
| S-041 | SURFACE | Yearly revenue report | Salon/platform surface | N-SALON-001 | /reports/revenue/yearly | | | see Part 2 |
| S-042 | SURFACE | Staff metric reports | Salon/platform surface | N-SALON-001 | /reports/staff/[metric] | | | see Part 2 |
| S-043 | SURFACE | Inventory products report | Salon/platform surface | N-SALON-001 | /reports/inventory/products | | | see Part 2 |
| S-044 | SURFACE | Stock movement report | Salon/platform surface | N-SALON-001 | /reports/inventory/stock | | | see Part 2 |
| S-045 | SURFACE | Low stock report | Salon/platform surface | N-SALON-001 | /reports/inventory/low-stock | | | see Part 2 |
| S-046 | SURFACE | Customer loyalty report | Salon/platform surface | N-SALON-001 | /reports/customers/loyalty | | | see Part 2 |
| S-047 | SURFACE | Customer memberships report | Salon/platform surface | N-SALON-001 | /reports/customers/memberships | | | see Part 2 |
| S-048 | SURFACE | Customer packages report | Salon/platform surface | N-SALON-001 | /reports/customers/packages | | | see Part 2 |
| S-049 | SURFACE | GST report | Salon/platform surface | N-SALON-001 | /reports/finance/gst | | | see Part 2 |
| S-050 | SURFACE | Payments report | Salon/platform surface | N-SALON-001 | /reports/finance/payments | | | see Part 2 |
| S-051 | SURFACE | Discounts report | Salon/platform surface | N-SALON-001 | /reports/finance/discounts | | | see Part 2 |
| S-052 | SURFACE | Settings hub | Salon/platform surface | N-SALON-001 | /settings | | | see Part 2 |
| S-053 | SURFACE | Salon settings | Salon/platform surface | N-SALON-001 | /settings/salon | | | see Part 2 |
| S-054 | SURFACE | GST invoice settings | Salon/platform surface | N-SALON-001 | /settings/gst-invoice | | | see Part 2 |
| S-055 | SURFACE | Billing settings | Salon/platform surface | N-SALON-001 | /settings/billing | | | see Part 2 |
| S-056 | SURFACE | Inventory settings | Salon/platform surface | N-SALON-001 | /settings/inventory | | | see Part 2 |
| S-057 | SURFACE | Printer settings | Salon/platform surface | N-SALON-001 | /settings/printer | | | see Part 2 |
| S-058 | SURFACE | WhatsApp settings | Salon/platform surface | N-SALON-001 | /settings/whatsapp | | | see Part 2 |
| S-059 | SURFACE | Communication settings | Salon/platform surface | N-SALON-001 | /settings/communication | | | see Part 2 |
| S-060 | SURFACE | Appearance settings | Salon/platform surface | N-SALON-001 | /settings/appearance | | | see Part 2 |
| S-061 | SURFACE | Attendance settings | Salon/platform surface | N-SALON-001 | /settings/attendance | | | see Part 2 |
| S-062 | SURFACE | Permissions settings | Salon/platform surface | N-SALON-001 | /settings/permissions | | | see Part 2 |
| S-063 | SURFACE | Security settings | Salon/platform surface | N-SALON-001 | /settings/security | | | see Part 2 |
| S-064 | SURFACE | Historical import | Salon/platform surface | N-SALON-001 | /settings/historical-import | | | see Part 2 |
| S-065 | SURFACE | Inventory hub | Salon/platform surface | N-SALON-001 | /inventory | | | see Part 2 |
| S-066 | SURFACE | Stock levels | Salon/platform surface | N-SALON-001 | /inventory/stock | | | see Part 2 |
| S-067 | SURFACE | Stock movements | Salon/platform surface | N-SALON-001 | /inventory/movements | | | see Part 2 |
| S-068 | SURFACE | Stock adjustments list | Salon/platform surface | N-SALON-001 | /inventory/adjustments | | | see Part 2 |
| S-069 | SURFACE | New adjustment | Salon/platform surface | N-SALON-001 | /inventory/adjustments/new | | | see Part 2 |
| S-070 | SURFACE | On-floor stock | Salon/platform surface | N-SALON-001 | /inventory/on-floor | | | see Part 2 |
| S-071 | SURFACE | Inventory transfers | Salon/platform surface | N-SALON-001 | /inventory/transfers | | | see Part 2 |
| S-072 | SURFACE | Legacy PO purchases list | Salon/platform surface | N-SALON-001 | /inventory/purchases | | | see Part 2 |
| S-073 | SURFACE | Legacy PO detail | Salon/platform surface | N-SALON-001 | /inventory/purchases/[id] | | | see Part 2 |
| S-074 | SURFACE | Legacy PO new | Salon/platform surface | N-SALON-001 | /inventory/purchases/new | | | see Part 2 |
| S-075 | SURFACE | ERP vendors list (inventory path) | Salon/platform surface | N-SALON-001 | /inventory/vendors | | | see Part 2 |
| S-076 | SURFACE | ERP vendor detail (inventory path) | Salon/platform surface | N-SALON-001 | /inventory/vendors/[id] | | | see Part 2 |
| S-077 | SURFACE | ERP vendor new (inventory path) | Salon/platform surface | N-SALON-001 | /inventory/vendors/new | | | see Part 2 |
| S-078 | SURFACE | Top-level vendors | Salon/platform surface | N-SALON-001 | /vendors | | | see Part 2 |
| S-079 | SURFACE | Vendor new | Salon/platform surface | N-SALON-001 | /vendors/new | | | see Part 2 |
| S-080 | SURFACE | Vendor detail | Salon/platform surface | N-SALON-001 | /vendors/[id] | | | see Part 2 |
| S-081 | SURFACE | Vendor edit | Salon/platform surface | N-SALON-001 | /vendors/[id]/edit | | | see Part 2 |
| S-082 | SURFACE | Workforce home | Salon/platform surface | N-SALON-001 | /workforce/home | | | see Part 2 |
| S-083 | SURFACE | Workforce index | Salon/platform surface | N-SALON-001 | /workforce | | | see Part 2 |
| S-084 | SURFACE | Workforce operations | Salon/platform surface | N-SALON-001 | /workforce/operations | | | see Part 2 |
| S-085 | SURFACE | Employee portal /me | Salon/platform surface | N-SALON-001 | /me | | | see Part 2 |
| S-086 | SURFACE | Platform team (org invites) | Salon/platform surface | N-SALON-001 | /team | | | see Part 2 |
| S-087 | SURFACE | Team member detail | Salon/platform surface | N-SALON-001 | /team/[memberId] | | | see Part 2 |
| S-088 | SURFACE | Profile | Salon/platform surface | N-SALON-001 | /profile | | | see Part 2 |
| S-089 | SURFACE | Access denied | Salon/platform surface | N-SALON-001 | /access-denied | | | see Part 2 |
| S-090 | SURFACE | Salon login | Salon/platform surface | N-SALON-001 | /auth/login | | | see Part 2 |
| S-091 | SURFACE | Org picker | Salon/platform surface | N-SALON-001 | /select-organization | | | see Part 2 |
| S-092 | SURFACE | Public invoice (long URL) | Salon/platform surface | N-SALON-001 | /invoice/[invoiceNumber] | | | see Part 2 |
| S-093 | SURFACE | Public invoice short | Salon/platform surface | N-SALON-001 | /i/[invoiceNumber] | | | see Part 2 |
| S-094 | SURFACE | Salon software marketing | Salon/platform surface | N-SALON-001 | /salon-software | | | see Part 2 |
| S-095 | SURFACE | Subscribe marketing | Salon/platform surface | N-SALON-001 | /subscribe | | | see Part 2 |
| S-096 | SURFACE | Brand concepts | Salon/platform surface | N-SALON-001 | /brand-concepts | | | see Part 2 |
| S-097 | SURFACE | Global search API | Salon/platform surface | N-SALON-001 | /fyh/api/search | | | see Part 2 |
| S-098 | SURFACE | Quick Sale customers API | Salon/platform surface | N-SALON-001 | /fyh/api/quick-sale/customers | | | see Part 2 |
| S-099 | SURFACE | Invoice print (auth) | Salon/platform surface | N-SALON-001 | /fyh/api/invoices/[invoiceId]/print | | | see Part 2 |
| S-100 | SURFACE | Public invoice print | Salon/platform surface | N-SALON-001 | /fyh/api/invoices/public/[invoiceNumber]/print | | | see Part 2 |
| S-101 | SURFACE | Office geocode API | Salon/platform surface | N-SALON-001 | /fyh/api/office-location/geocode | | | see Part 2 |
| S-102 | SURFACE | Staff QR API | Salon/platform surface | N-SALON-001 | /fyh/api/staff/qr | | | see Part 2 |
| S-103 | SURFACE | Select org bind | Salon/platform surface | N-SALON-001 | /fyh/select-organization/bind | | | see Part 2 |
| S-104 | SURFACE | Vendor statement PDF | Salon/platform surface | N-SALON-001 | /api/hair/vendors/[id]/statement/pdf | | | see Part 2 |
| S-105 | SURFACE | Vendor files | Salon/platform surface | N-SALON-001 | /api/hair/vendor-files | | | see Part 2 |
| P-001 | SURFACE | Platform admin home | Salon/platform surface | N-PLAT-001 | /platform/admin | | | see Part 2 |
| P-002 | SURFACE | Platform organizations | Salon/platform surface | N-PLAT-001 | /platform/admin/organizations | | | see Part 2 |
| P-003 | SURFACE | Platform org detail | Salon/platform surface | N-PLAT-001 | /platform/admin/organizations/[id] | | | see Part 2 |
| P-004 | SURFACE | Platform org members | Salon/platform surface | N-PLAT-001 | /platform/admin/organizations/[id]/members | | | see Part 2 |
| P-005 | SURFACE | Platform org locations | Salon/platform surface | N-PLAT-001 | /platform/admin/organizations/[id]/locations | | | see Part 2 |
| P-006 | SURFACE | Platform new org | Salon/platform surface | N-PLAT-001 | /platform/admin/organizations/new | | | see Part 2 |
| P-007 | SURFACE | Platform locations | Salon/platform surface | N-PLAT-001 | /platform/admin/locations | | | see Part 2 |
| P-008 | SURFACE | Platform users | Salon/platform surface | N-PLAT-001 | /platform/admin/users | | | see Part 2 |
| P-009 | SURFACE | Platform subscriptions | Salon/platform surface | N-PLAT-001 | /platform/admin/subscriptions | | | see Part 2 |
| P-010 | SURFACE | Platform plans | Salon/platform surface | N-PLAT-001 | /platform/admin/plans | | | see Part 2 |
| P-011 | SURFACE | Platform payment submissions | Salon/platform surface | N-PLAT-001 | /platform/admin/payment-submissions | | | see Part 2 |
| P-012 | SURFACE | Platform onboarding | Salon/platform surface | N-PLAT-001 | /platform/admin/onboarding | | | see Part 2 |
| P-013 | SURFACE | Platform activity | Salon/platform surface | N-PLAT-001 | /platform/admin/activity | | | see Part 2 |
| P-014 | SURFACE | Platform search | Salon/platform surface | N-PLAT-001 | /platform/admin/search | | | see Part 2 |
| P-015 | SURFACE | Platform dashboard | Salon/platform surface | N-PLAT-001 | /platform/dashboard | | | see Part 2 |
| P-016 | SURFACE | Platform login | Salon/platform surface | N-PLAT-001 | /platform/auth/login | | | see Part 2 |
| P-017 | SURFACE | Accept invite | Salon/platform surface | N-PLAT-001 | /platform/auth/accept-invite | | | see Part 2 |
| P-018 | SURFACE | Stripe webhook | Salon/platform surface | N-PLAT-001 | /api/platform/stripe/webhook | | | see Part 2 |
| S-001 | SURFACE | Owner, manager | Salon/platform surface | N-SALON-001 | page:dashboard_revenue | | | see Part 2 |
| S-002 | SURFACE | Owner, manager | Salon/platform surface | N-SALON-001 | page:dashboard_staff | | | see Part 2 |
| S-009 | SURFACE | Staff | Salon/platform surface | N-SALON-001 | page:appointments | | | see Part 2 |
| S-013 | SURFACE | Cashier | Salon/platform surface | N-SALON-001 | page:quick_sale | | | see Part 2 |
| S-014 | SURFACE | Billing | Salon/platform surface | N-SALON-001 | page:billing | | | see Part 2 |
| S-019 | SURFACE | Employee | Salon/platform surface | N-SALON-001 | page:appointments | | | see Part 2 |
| S-020 | SURFACE | Manager | Salon/platform surface | N-SALON-001 | page:dashboard | | | see Part 2 |
| S-021 | SURFACE | Manager | Salon/platform surface | N-SALON-001 | page:dashboard | | | see Part 2 |
| S-066 | SURFACE | Admin | Salon/platform surface | N-SALON-001 | page:inventory | | | see Part 2 |
| S-067 | SURFACE | Admin | Salon/platform surface | N-SALON-001 | page:inventory | | | see Part 2 |
| S-070 | SURFACE | Admin | Salon/platform surface | N-SALON-001 | page:inventory | | | see Part 2 |
| S-071 | SURFACE | Admin | Salon/platform surface | N-SALON-001 | page:inventory | | | see Part 2 |
| S-026 | SURFACE | Staff | Salon/platform surface | N-SALON-001 | page:expenses | | | see Part 2 |
| S-028 | SURFACE | Staff | Salon/platform surface | N-SALON-001 | page:customers | | | see Part 2 |
| S-029 | SURFACE | Admin | Salon/platform surface | N-SALON-001 | page:memberships | | | see Part 2 |
| S-064 | SURFACE | Super admin | Salon/platform surface | N-SALON-001 | action:import.historical | | | see Part 2 |
| S-028 | SURFACE | Manager | Salon/platform surface | N-SALON-001 | action:staff.commission_pay | | | see Part 2 |

## NODES — Hair DB tables

| NODE-ID | TYPE | NAME | DESCRIPTION | PARENT | ROUTE | TABLE | ROLE | STATUS |
|---------|------|------|-------------|--------|-------|-------|------|--------|
| E-H-001 | TABLE | fyh_admin_users | Legacy salon admin identities | N-SALON-001 | | fyh_admin_users | | schema |
| E-H-002 | TABLE | fyh_auth_sessions | Legacy admin sessions | N-SALON-001 | | fyh_auth_sessions | | schema |
| E-H-003 | TABLE | fyh_settings | Salon settings | N-SALON-001 | | fyh_settings | | schema |
| E-H-004 | TABLE | fyh_customers | CRM customers | N-SALON-001 | | fyh_customers | | schema |
| E-H-005 | TABLE | fyh_customer_notes | Notes | N-SALON-001 | | fyh_customer_notes | | schema |
| E-H-006 | TABLE | fyh_customer_timeline | Timeline | N-SALON-001 | | fyh_customer_timeline | | schema |
| E-H-007 | TABLE | fyh_staff | Operational stylists | N-SALON-001 | | fyh_staff | | schema |
| E-H-008 | TABLE | fyh_staff_schedules | Schedules | N-SALON-001 | | fyh_staff_schedules | | schema |
| E-H-009 | TABLE | fyh_resources | Chairs/resources | N-SALON-001 | | fyh_resources | | schema |
| E-H-010 | TABLE | fyh_service_categories | Categories | N-SALON-001 | | fyh_service_categories | | schema |
| E-H-011 | TABLE | fyh_services | Services | N-SALON-001 | | fyh_services | | schema |
| E-H-012 | TABLE | fyh_service_staff | Service-staff M2M | N-SALON-001 | | fyh_service_staff | | schema |
| E-H-013 | TABLE | fyh_service_consumables | BOM | N-SALON-001 | | fyh_service_consumables | | schema |
| E-H-014 | TABLE | fyh_appointments | Appointments | N-SALON-001 | | fyh_appointments | | schema |
| E-H-015 | TABLE | fyh_appointment_services | Appt lines | N-SALON-001 | | fyh_appointment_services | | schema |
| E-H-016 | TABLE | fyh_invoices | Invoices | N-SALON-001 | | fyh_invoices | | schema |
| E-H-017 | TABLE | fyh_invoice_lines | Lines | N-SALON-001 | | fyh_invoice_lines | | schema |
| E-H-018 | TABLE | fyh_invoice_payments | Payments | N-SALON-001 | | fyh_invoice_payments | | schema |
| E-H-019 | TABLE | fyh_credit_notes | Credit notes | N-SALON-001 | | fyh_credit_notes | | schema |
| E-H-020 | TABLE | fyh_financial_ledger | Ledger | N-SALON-001 | | fyh_financial_ledger | | schema |
| E-H-021 | TABLE | fyh_invoice_line_attributions | Attributions | N-SALON-001 | | fyh_invoice_line_attributions | | schema |
| E-H-022 | TABLE | fyh_commission_entries | Commissions | N-SALON-001 | | fyh_commission_entries | | schema |
| E-H-023 | TABLE | fyh_commission_rules | Rules scaffold | N-SALON-001 | | fyh_commission_rules | | schema |
| E-H-024 | TABLE | fyh_brands | Brands | N-SALON-001 | | fyh_brands | | schema |
| E-H-025 | TABLE | fyh_products | Products | N-SALON-001 | | fyh_products | | schema |
| E-H-026 | TABLE | fyh_stock_movements | Stock ledger | N-SALON-001 | | fyh_stock_movements | | schema |
| E-H-027 | TABLE | fyh_vendors | Vendors | N-SALON-001 | | fyh_vendors | | schema |
| E-H-028 | TABLE | fyh_purchase_orders | Legacy PO | N-SALON-001 | | fyh_purchase_orders | | schema |
| E-H-029 | TABLE | fyh_purchase_order_lines | PO lines | N-SALON-001 | | fyh_purchase_order_lines | | schema |
| E-H-030 | TABLE | fyh_goods_receipts | GRN | N-SALON-001 | | fyh_goods_receipts | | schema |
| E-H-031 | TABLE | fyh_goods_receipt_lines | GRN lines | N-SALON-001 | | fyh_goods_receipt_lines | | schema |
| E-H-032 | TABLE | fyh_stock_adjustments | Adjustments | N-SALON-001 | | fyh_stock_adjustments | | schema |
| E-H-033 | TABLE | fyh_product_batches | Batches | N-SALON-001 | | fyh_product_batches | | schema |
| E-H-034 | TABLE | fyh_purchases | ERP purchases | N-SALON-001 | | fyh_purchases | | schema |
| E-H-035 | TABLE | fyh_purchase_lines | ERP lines | N-SALON-001 | | fyh_purchase_lines | | schema |
| E-H-036 | TABLE | fyh_vendor_payables | AP | N-SALON-001 | | fyh_vendor_payables | | schema |
| E-H-037 | TABLE | fyh_vendor_payments | Vendor payments | N-SALON-001 | | fyh_vendor_payments | | schema |
| E-H-038 | TABLE | fyh_vendor_payment_allocations | Allocations | N-SALON-001 | | fyh_vendor_payment_allocations | | schema |
| E-H-039 | TABLE | fyh_purchase_returns | Returns | N-SALON-001 | | fyh_purchase_returns | | schema |
| E-H-040 | TABLE | fyh_purchase_return_lines | Return lines | N-SALON-001 | | fyh_purchase_return_lines | | schema |
| E-H-041 | TABLE | fyh_purchase_audit_events | Audit | N-SALON-001 | | fyh_purchase_audit_events | | schema |
| E-H-042 | TABLE | fyh_vendor_notes | Vendor notes | N-SALON-001 | | fyh_vendor_notes | | schema |
| E-H-043 | TABLE | fyh_expenses | Expenses | N-SALON-001 | | fyh_expenses | | schema |
| E-H-044 | TABLE | fyh_membership_plans | Membership plans | N-SALON-001 | | fyh_membership_plans | | schema |
| E-H-045 | TABLE | fyh_customer_memberships | Sold memberships | N-SALON-001 | | fyh_customer_memberships | | schema |
| E-H-046 | TABLE | fyh_package_plans | Package plans | N-SALON-001 | | fyh_package_plans | | schema |
| E-H-047 | TABLE | fyh_package_plan_items | Plan items | N-SALON-001 | | fyh_package_plan_items | | schema |
| E-H-048 | TABLE | fyh_customer_packages | Customer packages | N-SALON-001 | | fyh_customer_packages | | schema |
| E-H-049 | TABLE | fyh_customer_package_credits | Credits | N-SALON-001 | | fyh_customer_package_credits | | schema |
| E-H-050 | TABLE | fyh_package_credit_ledger | Credit ledger | N-SALON-001 | | fyh_package_credit_ledger | | schema |
| E-H-051 | TABLE | fyh_bridal_profiles | Bridal | N-SALON-001 | | fyh_bridal_profiles | | schema |
| E-H-052 | TABLE | fyh_bridal_events | Bridal events | N-SALON-001 | | fyh_bridal_events | | schema |
| E-H-053 | TABLE | fyh_notification_templates | Templates | N-SALON-001 | | fyh_notification_templates | | schema |
| E-H-054 | TABLE | fyh_notification_outbox | Outbox | N-SALON-001 | | fyh_notification_outbox | | schema |
| E-H-055 | TABLE | fyh_historical_import_batches | Import batches | N-SALON-001 | | fyh_historical_import_batches | | schema |
| E-H-056 | TABLE | fyh_historical_import_row_errors | Import errors | N-SALON-001 | | fyh_historical_import_row_errors | | schema |
| E-H-057 | TABLE | fyh_floor_issues | Floor stock | N-SALON-001 | | fyh_floor_issues | | schema |
| E-H-058 | TABLE | fyh_tenant_mirror | Tenant mirror | N-SALON-001 | | fyh_tenant_mirror | | schema |
| E-H-059 | TABLE | fyh_org_invoice_sequences | Invoice seq | N-SALON-001 | | fyh_org_invoice_sequences | | schema |
| E-H-060 | TABLE | fyh_org_customer_sequences | Customer seq | N-SALON-001 | | fyh_org_customer_sequences | | schema |
| E-H-061 | TABLE | fyh_staff_locations | Staff locations | N-SALON-001 | | fyh_staff_locations | | schema |
| E-H-062 | TABLE | fyh_location_stock | Location stock | N-SALON-001 | | fyh_location_stock | | schema |
| E-H-063 | TABLE | saas_waitlist_signups | Waitlist | N-SALON-001 | | saas_waitlist_signups | | schema |
| E-W-001 | TABLE | wf_employees | Employees | N-SALON-001 | | wf_employees | | schema |
| E-W-002 | TABLE | wf_engine_memberships | Memberships | N-SALON-001 | | wf_engine_memberships | | schema |
| E-W-003 | TABLE | wf_permission_grants | Grants | N-SALON-001 | | wf_permission_grants | | schema |
| E-W-004 | TABLE | wf_role_templates | Templates | N-SALON-001 | | wf_role_templates | | schema |
| E-W-005 | TABLE | wf_schedules | Schedules | N-SALON-001 | | wf_schedules | | schema |
| E-W-006 | TABLE | wf_attendance | Attendance | N-SALON-001 | | wf_attendance | | schema |
| E-W-007 | TABLE | wf_attendance_corrections | Corrections | N-SALON-001 | | wf_attendance_corrections | | schema |
| E-W-008 | TABLE | wf_payroll_runs | Payroll runs | N-SALON-001 | | wf_payroll_runs | | schema |
| E-W-009 | TABLE | wf_payroll_lines | Payroll lines | N-SALON-001 | | wf_payroll_lines | | schema |
| E-W-010 | TABLE | wf_payroll_payments | Payroll payments | N-SALON-001 | | wf_payroll_payments | | schema |
| E-W-011 | TABLE | wf_incentives | Incentives | N-SALON-001 | | wf_incentives | | schema |
| E-W-012 | TABLE | wf_incentive_plans | Incentive plans | N-SALON-001 | | wf_incentive_plans | | schema |
| E-W-013 | TABLE | wf_auth_sessions | Sessions (no org_id) | N-SALON-001 | | wf_auth_sessions | | schema |
| E-W-014 | TABLE | wf_audit_log | Audit | N-SALON-001 | | wf_audit_log | | schema |
| E-W-015 | TABLE | wf_events | Events | N-SALON-001 | | wf_events | | schema |

## NODES — Platform DB tables

| NODE-ID | TYPE | NAME | DESCRIPTION | PARENT | ROUTE | TABLE | ROLE | STATUS |
|---------|------|------|-------------|--------|-------|-------|------|--------|
| E-P-001 | TABLE | platform.users | Users | N-PLAT-001 | | platform.users | | schema |
| E-P-002 | TABLE | platform.platform_memberships | Super admins | N-PLAT-001 | | platform.platform_memberships | | schema |
| E-P-003 | TABLE | platform.plans | Plans | N-PLAT-001 | | platform.plans | | schema |
| E-P-004 | TABLE | platform.organizations | Organizations | N-PLAT-001 | | platform.organizations | | schema |
| E-P-005 | TABLE | platform.locations | Locations | N-PLAT-001 | | platform.locations | | schema |
| E-P-006 | TABLE | platform.memberships | Memberships | N-PLAT-001 | | platform.memberships | | schema |
| E-P-007 | TABLE | platform.membership_locations | Membership locations | N-PLAT-001 | | platform.membership_locations | | schema |
| E-P-008 | TABLE | platform.organization_subscriptions | Subscriptions | N-PLAT-001 | | platform.organization_subscriptions | | schema |
| E-P-009 | TABLE | platform.organization_entitlements | Entitlements | N-PLAT-001 | | platform.organization_entitlements | | schema |
| E-P-010 | TABLE | platform.invitations | Invitations | N-PLAT-001 | | platform.invitations | | schema |
| E-P-011 | TABLE | platform.subscription_events | Sub events | N-PLAT-001 | | platform.subscription_events | | schema |
| E-P-012 | TABLE | platform.billing_webhook_events | Webhook log | N-PLAT-001 | | platform.billing_webhook_events | | schema |
| E-P-013 | TABLE | platform.billing_qr_settings | QR settings | N-PLAT-001 | | platform.billing_qr_settings | | schema |
| E-P-014 | TABLE | platform.subscription_payment_submissions | Manual payments | N-PLAT-001 | | platform.subscription_payment_submissions | | schema |

## NODES — Features F-01 … F-65

| F-01 | FEATURE | Feature F-01 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-02 | FEATURE | Feature F-02 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-03 | FEATURE | Feature F-03 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-04 | FEATURE | Feature F-04 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-05 | FEATURE | Feature F-05 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-06 | FEATURE | Feature F-06 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-07 | FEATURE | Feature F-07 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-08 | FEATURE | Feature F-08 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-09 | FEATURE | Feature F-09 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-10 | FEATURE | Feature F-10 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-11 | FEATURE | Feature F-11 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-12 | FEATURE | Feature F-12 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-13 | FEATURE | Feature F-13 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-14 | FEATURE | Feature F-14 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-15 | FEATURE | Feature F-15 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-16 | FEATURE | Feature F-16 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-17 | FEATURE | Feature F-17 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-18 | FEATURE | Feature F-18 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-19 | FEATURE | Feature F-19 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-20 | FEATURE | Feature F-20 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-21 | FEATURE | Feature F-21 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-22 | FEATURE | Feature F-22 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-23 | FEATURE | Feature F-23 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-24 | FEATURE | Feature F-24 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-25 | FEATURE | Feature F-25 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-26 | FEATURE | Feature F-26 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-27 | FEATURE | Feature F-27 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-28 | FEATURE | Feature F-28 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-29 | FEATURE | Feature F-29 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-30 | FEATURE | Feature F-30 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-31 | FEATURE | Feature F-31 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-32 | FEATURE | Feature F-32 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-33 | FEATURE | Feature F-33 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-34 | FEATURE | Feature F-34 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-35 | FEATURE | Feature F-35 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-36 | FEATURE | Feature F-36 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-37 | FEATURE | Feature F-37 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-38 | FEATURE | Feature F-38 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-39 | FEATURE | Feature F-39 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-40 | FEATURE | Feature F-40 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-41 | FEATURE | Feature F-41 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-42 | FEATURE | Feature F-42 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-43 | FEATURE | Feature F-43 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-44 | FEATURE | Feature F-44 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-45 | FEATURE | Feature F-45 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-46 | FEATURE | Feature F-46 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-47 | FEATURE | Feature F-47 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-48 | FEATURE | Feature F-48 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-49 | FEATURE | Feature F-49 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-50 | FEATURE | Feature F-50 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-51 | FEATURE | Feature F-51 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-52 | FEATURE | Feature F-52 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-53 | FEATURE | Feature F-53 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-54 | FEATURE | Feature F-54 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-55 | FEATURE | Feature F-55 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-56 | FEATURE | Feature F-56 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-57 | FEATURE | Feature F-57 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-58 | FEATURE | Feature F-58 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-59 | FEATURE | Feature F-59 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-60 | FEATURE | Feature F-60 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-61 | FEATURE | Feature F-61 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-62 | FEATURE | Feature F-62 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-63 | FEATURE | Feature F-63 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-64 | FEATURE | Feature F-64 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |
| F-65 | FEATURE | Feature F-65 | See COMPLETE-AUDIT Part 3 | N-SALON-001 | | | | |

---

## EDGES

| FROM | RELATION | TO | DESCRIPTION | SOURCE FILE |
|------|----------|-----|-------------|-------------|
| N-HOST | ROUTES | N-SALON-001 | Hair host allowlist | src/hair/lib/host.ts |
| N-SALON-001 | HOSTED_ON | N-HOST | Middleware routes Hair paths | middleware.ts |
| S-013 | TRIGGERS | N-ACT-QS | Quick Sale page | app/(hair)/fyh/(app)/quick-sale/page.tsx |
| N-ACT-QS | CALLS | N-DOM-CHECKOUT | checkoutFromBasket on pay | src/hair/actions/quickSale.ts |
| N-DOM-CHECKOUT | USES | N-DOM-BASKET | priceBasket | src/hair/domain/checkout/pipeline.ts |
| N-DOM-CHECKOUT | WRITES | E-H-016 | fyh_invoices | src/hair/domain/checkout/pipeline.ts |
| N-DOM-CHECKOUT | WRITES | E-H-021 | fyh_invoice_line_attributions | src/hair/domain/checkout/pipeline.ts |
| N-DOM-CHECKOUT | CALLS | N-SVC-INV | applyPaidSideEffects | src/hair/domain/checkout/pipeline.ts |
| N-SVC-INV | CALLS | N-SVC-STOCK | Consumables on pay | src/hair/services/invoices.ts |
| N-SVC-INV | WRITES | E-H-020 | fyh_financial_ledger | src/hair/services/invoices.ts |
| S-009 | TRIGGERS | N-ACT-APT | Appointments calendar | app/(hair)/fyh/(app)/appointments/page.tsx |
| N-ACT-APT | CALLS | N-SVC-APT | CRUD + checkout | src/hair/actions/appointments.ts |
| N-SVC-APT | REFERENCES | E-H-007 | fyh_staff FK | src/hair/services/appointments.ts |
| N-SVC-APT | REDIRECTS | S-013 | Checkout basket URL | src/hair/services/appointments.ts |
| N-ACT-QS | READS | N-SVC-CAT | Billable catalog | src/hair/actions/quickSale.ts |
| N-RBAC-WF | MAPS | N-RBAC-LEG | hairAdminBridge | src/workforce/compat/hairAdminBridge.ts |
| N-RBAC-LEG | GUARDS | S-013 | page:quick_sale layout | app/(hair)/fyh/(app)/layout.tsx |
| E-P-004 | MIRRORS | N-TENANT-001 | organization_id on Hair rows | src/hair/lib/tenant/resolveTenantContext.ts |
| N-FLAG-SAAS | ENABLES | N-TENANT-001 | orgFilter | src/hair/lib/tenant/filters.ts |
| E-H-016 | DISPLAYED_BY | S-092 | Public invoice lookup | src/hair/services/invoices.ts |
| ISS-02 | AFFECTS | S-092 | Cross-tenant number collision | docs/SAAS_READINESS.md |
| ISS-01 | AFFECTS | N-SVC-CAT | Unscoped catalog | docs/SAAS_READINESS.md |
| S-022 | USES | N-SVC-STOCK | ERP purchase inward | src/hair/services/purchaseEngine.ts |
| N-PLAT-001 | INTEGRATES | P-018 | Stripe webhook | app/api/platform/stripe/webhook/route.ts |
| F-07 | USES | N-DOM-CHECKOUT | Quick Sale authoritative billing | src/hair/domain/checkout/pipeline.ts |
| E-H-014 | LINKS | E-H-016 | appointment.invoice_id | src/hair/db/schema/appointments.ts |
| E-H-004 | OWNS | E-H-014 | customer_id | src/hair/db/schema/appointments.ts |
| S-019 | USES | E-W-006 | Self attendance | src/workforce/actions/attendance.ts |
| N-DOM-CHECKOUT | ENQUEUES | E-H-054 | notification outbox | src/hair/services/invoices.ts |
| S-014 | TRIGGERS | N-ACT-ADV | Advance payment | src/hair/actions/advancePayment.ts |
| N-ACT-ADV | WRITES | E-H-016 | source advance_payment | src/hair/actions/advancePayment.ts |
| ISS-06 | DUPLICATES | S-022 | ERP purchases path | docs/product-brain/FYHAIR-SALON-BRAIN.md |
| ISS-06 | DUPLICATES | S-072 | Legacy PO path | docs/product-brain/FYHAIR-SALON-BRAIN.md |

---

## NODES — Issues (ISS-01 … ISS-25)

| NODE-ID | TYPE | NAME | DESCRIPTION | PARENT | ROUTE | TABLE | ROLE | STATUS |
|---------|------|------|-------------|--------|-------|-------|------|--------|
| ISS-01 | ISSUE | ISS-01 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | open |
| ISS-02 | ISSUE | ISS-02 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | open |
| ISS-03 | ISSUE | ISS-03 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | open |
| ISS-04 | ISSUE | ISS-04 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | open |
| ISS-05 | ISSUE | ISS-05 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | partial |
| ISS-06 | ISSUE | ISS-06 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | open |
| ISS-07 | ISSUE | ISS-07 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | open |
| ISS-08 | ISSUE | ISS-08 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | broken |
| ISS-09 | ISSUE | ISS-09 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | broken |
| ISS-10 | ISSUE | ISS-10 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | partial |
| ISS-11 | ISSUE | ISS-11 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | partial |
| ISS-12 | ISSUE | ISS-12 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | placeholder |
| ISS-13 | ISSUE | ISS-13 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | partial |
| ISS-14 | ISSUE | ISS-14 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | partial |
| ISS-15 | ISSUE | ISS-15 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | partial |
| ISS-16 | ISSUE | ISS-16 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | open |
| ISS-17 | ISSUE | ISS-17 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | doc |
| ISS-18 | ISSUE | ISS-18 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | open |
| ISS-19 | ISSUE | ISS-19 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | unclear |
| ISS-20 | ISSUE | ISS-20 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | unclear |
| ISS-21 | ISSUE | ISS-21 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | placeholder |
| ISS-22 | ISSUE | ISS-22 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | partial |
| ISS-23 | ISSUE | ISS-23 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | by-design |
| ISS-24 | ISSUE | ISS-24 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | open |
| ISS-25 | ISSUE | ISS-25 | See COMPLETE-AUDIT Part 23 | N-SALON-001 | | | | partial |


| WF-REAL-001 | WORKFLOW | Express Sale customer step | FyhCustomerSearch | N-SALON-001 | /quick-sale | | reception | working |
| WF-REAL-002 | WORKFLOW | Express Sale checkout | completeQuickSaleAction | S-013 | /quick-sale | | cashier | working |
| WF-REAL-003 | WORKFLOW | Appointment to QS | checkoutAppointmentAction redirect | S-009 | /appointments | | reception | working |

| S-013 | TRIGGERS | WF-REAL-002 | User completes sale | src/hair/components/quick-sale/QuickSaleShell.tsx |
| S-009 | REDIRECTS | S-013 | appointmentId query prefill | src/hair/actions/appointments.ts |
| WF-REAL-002 | CALLS | N-DOM-CHECKOUT | checkoutFromBasket | src/hair/actions/quickSale.ts |
| N-DOM-CHECKOUT | CALLS | N-SVC-INV | applyPaidSideEffects when paid | src/hair/domain/checkout/pipeline.ts |
| N-SVC-INV | CALLS | N-SVC-STOCK | quick_sale inventory path | src/hair/services/invoices.ts applyPaidSideEffects |
| S-012 | VOIDS | fyh_invoices | cancel and edit both set status void | src/hair/services/invoiceCancellation.ts |
| S-012 | DOES_NOT_REVERSE | N-SVC-STOCK | void leaves stock movements | src/hair/services/invoiceCancellation.ts |
| N-DOM-CHECKOUT | DISTINGUISHES | wallet_redemption | customer credit spends advance | src/hair/domain/ledger/plan.ts |
| N-DOM-CHECKOUT | DISTINGUISHES | receivable_open | mark as due increases amount owed | src/hair/domain/ledger/plan.ts |

*End of FYHAIR-GRAPH-DATA.md*

---

## Forensic workflow audit (2026-10-04)

See [`FYHAIR-REAL-WORKFLOW-AUDIT.md`](./FYHAIR-REAL-WORKFLOW-AUDIT.md) and [`FYHAIR-REAL-WORKFLOW-GRAPH.mermaid`](./FYHAIR-REAL-WORKFLOW-GRAPH.mermaid).

**Proven corrections vs prior docs:**

- Quick Sale **retail + consumable inventory** deduction on paid checkout runs via `applyPaidSideEffects` → `applyInventorySideEffects` for `source=quick_sale` (verify against FEATURES.md “next phase” — code wins).
- **Hold bill create** button lives only in unused `QuickSaleCheckoutColumn`; compact `QuickSaleShell` exposes **resume held bills** on customer step but not hold submit in UI (tests confirm column not mounted).
- Express Sale entry: **9-dot Express Sale** primary; nav Quick Sale link hidden.

### Revenue dashboard and expenses (2026-10-06)

- `fyh_expense_attachments` hangs off `fyh_expenses` (cascade delete). The parent row still keeps the first file on `attachment_url`.
- Dashboard sales read `fyh_invoice_lines` joined to issued `fyh_invoices`. Collection and dues collected read `fyh_financial_ledger`. Refunds read `fyh_credit_notes`.
