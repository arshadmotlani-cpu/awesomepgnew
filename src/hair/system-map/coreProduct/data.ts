/**
 * Salon Software — Core Product Workshop data (audit-grounded only).
 * Sources: docs/product-brain/*, docs/SAAS_READINESS.md, docs/foryourhair/*
 */

export type ProductBadge =
  | 'IMPLEMENTED'
  | 'PARTIAL'
  | 'MISSING'
  | 'UNSAFE'
  | 'TARGET'
  | 'TO_BE_DEFINED';

export type ProductBoundary = 'core' | 'platform' | 'advanced';

export type ConfigLevel =
  | 'CURRENTLY_CONFIGURABLE'
  | 'TARGET_CONFIGURABLE'
  | 'PLATFORM_CONTROLLED'
  | 'TO_BE_DEFINED';

export type AreaImportance = 'primary' | 'secondary' | 'support';

export interface ProductArea {
  id: string;
  slug: string;
  name: string;
  boundary: ProductBoundary;
  importance: AreaImportance;
  connectsTo: string[];
  currentBadge: ProductBadge;
  targetBadge: ProductBadge;
  tbd?: string[];
  graphNodeIds?: string[];
  evidence: string[];
}

export interface CoreSpineStep {
  id: string;
  label: string;
  areaIds: string[];
  evidence: string[];
}

export interface InvoiceBranch {
  id: string;
  label: string;
  areaIds: string[];
  evidence: string[];
}

export interface WorkflowDetail {
  areaIds: string[];
  who: string[];
  action: string[];
  data: string[];
  rules: string[];
  result: string[];
  sideEffects: string[];
  reporting: string[];
  evidence: string[];
}

export interface ConfigItem {
  key: string;
  label: string;
  configLevel: ConfigLevel;
  notes: string;
  evidence: string[];
}

export interface ConfigGroup {
  id: string;
  label: string;
  items: ConfigItem[];
}

export interface RoleJourneyStep {
  label: string;
  evidence: string[];
}

export interface RoleJourney {
  role: string;
  steps: RoleJourneyStep[];
}

export interface BusinessDayStage {
  id: string;
  label: string;
  areaIds: string[];
  evidence: string[];
}

export interface ProductGap {
  id: string;
  title: string;
  currentBadge: ProductBadge;
  targetBadge: ProductBadge;
  evidence: string[];
}

export interface DecisionRequired {
  id: string;
  question: string;
  status: 'DECISION_REQUIRED';
  evidence: string[];
}

const E_SALON_BRAIN = 'docs/product-brain/FYHAIR-SALON-BRAIN.md';
const E_CORE_MODEL = 'docs/product-brain/FYHAIR-CORE-PRODUCT-MODEL.md';
const E_AUDIT = 'docs/product-brain/FYHAIR-COMPLETE-AUDIT.md';
const E_SAAS = 'docs/SAAS_READINESS.md';
const E_RBAC = 'docs/foryourhair/RBAC_AUDIT.md';
const E_FEATURES = 'docs/foryourhair/FEATURES.md';
const E_NAV = 'src/hair/lib/nav.ts';
const E_PIPELINE = 'src/hair/domain/checkout/pipeline.ts';
const E_BASKET = 'src/hair/domain/basket/engine.ts';
const E_INVOICES = 'src/hair/services/invoices.ts';
const E_STOCK = 'src/hair/services/stock.ts';
const E_APPOINTMENTS = 'src/hair/services/appointments.ts';
const E_SETTLE = 'src/hair/lib/billing/invoiceSettlement.ts';
const E_CATALOG = 'src/hair/domain/catalog/adapter.ts';
const E_TENANT = 'src/hair/lib/tenant/filters.ts';
const E_ENRICH = 'src/hair/system-map/enrichment.ts';

export const PRODUCT_AREAS: ProductArea[] = [
  {
    id: 'CP-01',
    slug: 'salon-setup',
    name: 'Salon setup & dashboards',
    boundary: 'core',
    importance: 'primary',
    connectsTo: ['CP-02', 'CP-03', 'CP-24'],
    currentBadge: 'IMPLEMENTED',
    targetBadge: 'TARGET',
    graphNodeIds: ['MOD-DASH', 'MOD-SET'],
    evidence: [E_SALON_BRAIN, E_AUDIT, E_NAV],
  },
  {
    id: 'CP-02',
    slug: 'organization',
    name: 'Organization (tenant)',
    boundary: 'platform',
    importance: 'primary',
    connectsTo: ['CP-03', 'CP-05', 'CP-25'],
    currentBadge: 'PARTIAL',
    targetBadge: 'TARGET',
    tbd: ['TBD-01', 'TBD-02'],
    evidence: [E_SAAS, E_AUDIT, 'src/platform/db/schema/index.ts'],
  },
  {
    id: 'CP-03',
    slug: 'locations',
    name: 'Locations',
    boundary: 'platform',
    importance: 'secondary',
    connectsTo: ['CP-02', 'CP-09', 'CP-16'],
    currentBadge: 'PARTIAL',
    targetBadge: 'TARGET',
    tbd: ['TBD-08'],
    evidence: [E_SALON_BRAIN, E_AUDIT, 'src/hair/lib/tenant/resolveTenantContext.ts'],
  },
  {
    id: 'CP-04',
    slug: 'users',
    name: 'Users & platform team',
    boundary: 'platform',
    importance: 'primary',
    connectsTo: ['CP-05', 'CP-07', 'CP-25'],
    currentBadge: 'IMPLEMENTED',
    targetBadge: 'TARGET',
    evidence: [E_SALON_BRAIN, E_AUDIT, 'app/(hair)/fyh/(app)/team'],
  },
  {
    id: 'CP-05',
    slug: 'roles-permissions',
    name: 'Roles & permissions',
    boundary: 'core',
    importance: 'primary',
    connectsTo: ['CP-04', 'CP-07', 'CP-24'],
    currentBadge: 'PARTIAL',
    targetBadge: 'TARGET',
    tbd: ['TBD-11'],
    graphNodeIds: ['MOD-SET', 'N-RBAC-WF', 'N-RBAC-LEG', 'N-RBAC-BRIDGE'],
    evidence: [E_RBAC, E_SALON_BRAIN, 'src/workforce/compat/hairAdminBridge.ts'],
  },
  {
    id: 'CP-06',
    slug: 'customers',
    name: 'Customers (CRM)',
    boundary: 'core',
    importance: 'primary',
    connectsTo: ['CP-09', 'CP-10', 'CP-11', 'CP-18', 'CP-19', 'CP-20'],
    currentBadge: 'IMPLEMENTED',
    targetBadge: 'IMPLEMENTED',
    graphNodeIds: ['MOD-CRM'],
    evidence: [E_SALON_BRAIN, E_AUDIT, 'src/hair/services/customers.ts'],
  },
  {
    id: 'CP-07',
    slug: 'staff',
    name: 'Staff roster & performance',
    boundary: 'core',
    importance: 'primary',
    connectsTo: ['CP-05', 'CP-09', 'CP-21', 'CP-22'],
    currentBadge: 'PARTIAL',
    targetBadge: 'TARGET',
    graphNodeIds: ['MOD-WF-OPS'],
    evidence: [E_SALON_BRAIN, E_AUDIT, 'src/hair/db/schema/staff.ts'],
  },
  {
    id: 'CP-08',
    slug: 'services',
    name: 'Services catalog',
    boundary: 'core',
    importance: 'primary',
    connectsTo: ['CP-09', 'CP-10', 'CP-11', 'CP-24'],
    currentBadge: 'IMPLEMENTED',
    targetBadge: 'IMPLEMENTED',
    graphNodeIds: ['MOD-SVC', 'MOD-CFG'],
    evidence: [E_SALON_BRAIN, E_NAV, E_FEATURES],
  },
  {
    id: 'CP-09',
    slug: 'products',
    name: 'Products catalog',
    boundary: 'core',
    importance: 'primary',
    connectsTo: ['CP-08', 'CP-11', 'CP-16', 'CP-24'],
    currentBadge: 'IMPLEMENTED',
    targetBadge: 'IMPLEMENTED',
    graphNodeIds: ['MOD-PRD', 'MOD-CFG'],
    evidence: [E_SALON_BRAIN, E_AUDIT, E_NAV],
  },
  {
    id: 'CP-10',
    slug: 'appointments',
    name: 'Appointments calendar',
    boundary: 'core',
    importance: 'primary',
    connectsTo: ['CP-06', 'CP-07', 'CP-08', 'CP-11', 'CP-12'],
    currentBadge: 'IMPLEMENTED',
    targetBadge: 'IMPLEMENTED',
    graphNodeIds: ['MOD-APT'],
    evidence: [E_SALON_BRAIN, E_APPOINTMENTS, E_AUDIT],
  },
  {
    id: 'CP-11',
    slug: 'walk-ins',
    name: 'Walk-ins (Quick Sale POS)',
    boundary: 'core',
    importance: 'primary',
    connectsTo: ['CP-06', 'CP-08', 'CP-09', 'CP-12', 'CP-13'],
    currentBadge: 'IMPLEMENTED',
    targetBadge: 'TARGET',
    graphNodeIds: ['MOD-QS'],
    evidence: [E_SALON_BRAIN, E_FEATURES, 'src/hair/actions/quickSale.ts'],
  },
  {
    id: 'CP-12',
    slug: 'billing-pos',
    name: 'Billing hub & POS checkout',
    boundary: 'core',
    importance: 'primary',
    connectsTo: ['CP-13', 'CP-14', 'CP-15', 'CP-10', 'CP-11'],
    currentBadge: 'IMPLEMENTED',
    targetBadge: 'TARGET',
    graphNodeIds: ['MOD-BILL', 'MOD-QS'],
    evidence: [E_PIPELINE, E_BASKET, E_CORE_MODEL],
  },
  {
    id: 'CP-13',
    slug: 'payments',
    name: 'Payments & settlement',
    boundary: 'core',
    importance: 'primary',
    connectsTo: ['CP-12', 'CP-14', 'CP-15', 'CP-06'],
    currentBadge: 'PARTIAL',
    targetBadge: 'TARGET',
    tbd: ['TBD-06'],
    evidence: [E_SETTLE, E_INVOICES, E_AUDIT],
  },
  {
    id: 'CP-14',
    slug: 'invoices',
    name: 'Invoices & public share',
    boundary: 'core',
    importance: 'primary',
    connectsTo: ['CP-13', 'CP-15', 'CP-22', 'CP-23'],
    currentBadge: 'UNSAFE',
    targetBadge: 'TARGET',
    tbd: ['TBD-03'],
    graphNodeIds: ['MOD-BILL'],
    evidence: [E_INVOICES, E_SAAS, E_SALON_BRAIN],
  },
  {
    id: 'CP-15',
    slug: 'inventory',
    name: 'Inventory & stock',
    boundary: 'core',
    importance: 'secondary',
    connectsTo: ['CP-09', 'CP-16', 'CP-10', 'CP-11', 'CP-22'],
    currentBadge: 'PARTIAL',
    targetBadge: 'TARGET',
    tbd: ['TBD-08', 'TBD-10'],
    graphNodeIds: ['MOD-INV'],
    evidence: [E_STOCK, E_AUDIT, E_SALON_BRAIN],
  },
  {
    id: 'CP-16',
    slug: 'vendors-purchases',
    name: 'Vendors & purchases',
    boundary: 'core',
    importance: 'secondary',
    connectsTo: ['CP-15', 'CP-17'],
    currentBadge: 'PARTIAL',
    targetBadge: 'TARGET',
    tbd: ['TBD-04'],
    graphNodeIds: ['MOD-VEN', 'MOD-PUR'],
    evidence: [E_SALON_BRAIN, E_AUDIT, 'src/hair/services/purchases.ts'],
  },
  {
    id: 'CP-17',
    slug: 'expenses',
    name: 'Expenses',
    boundary: 'core',
    importance: 'secondary',
    connectsTo: ['CP-22', 'CP-03'],
    currentBadge: 'IMPLEMENTED',
    targetBadge: 'IMPLEMENTED',
    graphNodeIds: ['MOD-EXP'],
    evidence: [E_SALON_BRAIN, E_AUDIT, E_NAV],
  },
  {
    id: 'CP-18',
    slug: 'memberships',
    name: 'Memberships',
    boundary: 'core',
    importance: 'secondary',
    connectsTo: ['CP-06', 'CP-12', 'CP-19'],
    currentBadge: 'IMPLEMENTED',
    targetBadge: 'TARGET',
    graphNodeIds: ['MOD-MEM', 'MOD-CFG'],
    evidence: [E_SALON_BRAIN, E_AUDIT, E_FEATURES],
  },
  {
    id: 'CP-19',
    slug: 'packages',
    name: 'Packages',
    boundary: 'core',
    importance: 'secondary',
    connectsTo: ['CP-06', 'CP-12', 'CP-18'],
    currentBadge: 'IMPLEMENTED',
    targetBadge: 'TARGET',
    graphNodeIds: ['MOD-PKG', 'MOD-CFG'],
    evidence: [E_SALON_BRAIN, E_AUDIT, E_NAV],
  },
  {
    id: 'CP-20',
    slug: 'loyalty',
    name: 'Loyalty',
    boundary: 'advanced',
    importance: 'support',
    connectsTo: ['CP-06', 'CP-23'],
    currentBadge: 'PARTIAL',
    targetBadge: 'TARGET',
    graphNodeIds: ['MOD-LOY'],
    evidence: [E_SALON_BRAIN, E_AUDIT, E_ENRICH],
  },
  {
    id: 'CP-21',
    slug: 'workforce-attendance',
    name: 'Workforce & attendance',
    boundary: 'advanced',
    importance: 'secondary',
    connectsTo: ['CP-05', 'CP-07', 'CP-03'],
    currentBadge: 'PARTIAL',
    targetBadge: 'TARGET',
    graphNodeIds: ['MOD-ATT', 'MOD-WF-OPS'],
    evidence: [E_SALON_BRAIN, 'docs/WORKFORCE_ENGINE.md', E_AUDIT],
  },
  {
    id: 'CP-22',
    slug: 'reports',
    name: 'Reports & analytics',
    boundary: 'core',
    importance: 'secondary',
    connectsTo: ['CP-12', 'CP-14', 'CP-15', 'CP-07'],
    currentBadge: 'PARTIAL',
    targetBadge: 'TARGET',
    graphNodeIds: ['MOD-REP'],
    evidence: [E_SALON_BRAIN, E_AUDIT, E_NAV],
  },
  {
    id: 'CP-23',
    slug: 'notifications',
    name: 'Notifications',
    boundary: 'advanced',
    importance: 'support',
    connectsTo: ['CP-06', 'CP-10', 'CP-24'],
    currentBadge: 'MISSING',
    targetBadge: 'TARGET',
    tbd: ['TBD-07'],
    graphNodeIds: ['MOD-NOT'],
    evidence: [E_SALON_BRAIN, E_AUDIT, 'src/hair/services/notifications.ts'],
  },
  {
    id: 'CP-24',
    slug: 'settings',
    name: 'Settings & salon configuration',
    boundary: 'core',
    importance: 'primary',
    connectsTo: ['CP-01', 'CP-05', 'CP-08', 'CP-09'],
    currentBadge: 'IMPLEMENTED',
    targetBadge: 'TARGET',
    graphNodeIds: ['MOD-SET', 'MOD-CFG'],
    evidence: [E_CORE_MODEL, E_AUDIT, E_NAV],
  },
  {
    id: 'CP-25',
    slug: 'subscription-platform',
    name: 'SaaS subscription (platform)',
    boundary: 'platform',
    importance: 'support',
    connectsTo: ['CP-02', 'CP-04'],
    currentBadge: 'IMPLEMENTED',
    targetBadge: 'TARGET',
    tbd: ['TBD-12'],
    evidence: [E_SALON_BRAIN, E_SAAS, 'app/(platform)/platform/admin/subscriptions'],
  },
];

export const CORE_SPINE: CoreSpineStep[] = [
  {
    id: 'spine-salon',
    label: 'Salon',
    areaIds: ['CP-01', 'CP-02', 'CP-03', 'CP-24'],
    evidence: [E_SALON_BRAIN, E_TENANT, E_NAV],
  },
  {
    id: 'spine-customer',
    label: 'Customer',
    areaIds: ['CP-06'],
    evidence: [E_SALON_BRAIN, 'src/hair/actions/customers.ts'],
  },
  {
    id: 'spine-appointment-or-walkin',
    label: 'Appointment or walk-in',
    areaIds: ['CP-10', 'CP-11'],
    evidence: [E_SALON_BRAIN, E_APPOINTMENTS, E_FEATURES],
  },
  {
    id: 'spine-service-product',
    label: 'Service & product lines',
    areaIds: ['CP-08', 'CP-09'],
    evidence: [E_CATALOG, E_BASKET, E_FEATURES],
  },
  {
    id: 'spine-staff',
    label: 'Staff on lines',
    areaIds: ['CP-07'],
    evidence: [E_SALON_BRAIN, 'fyh_invoice_line_attributions'],
  },
  {
    id: 'spine-basket',
    label: 'Basket',
    areaIds: ['CP-12', 'CP-11'],
    evidence: [E_BASKET, E_PIPELINE],
  },
  {
    id: 'spine-pricing-tax-discount',
    label: 'Pricing, tax & discount preview',
    areaIds: ['CP-12', 'CP-18', 'CP-19'],
    evidence: [E_AUDIT, 'src/hair/lib/taxConfig.ts', E_FEATURES],
  },
  {
    id: 'spine-payment',
    label: 'Payment',
    areaIds: ['CP-13', 'CP-12'],
    evidence: [E_PIPELINE, E_SETTLE, E_INVOICES],
  },
  {
    id: 'spine-invoice',
    label: 'Invoice',
    areaIds: ['CP-14'],
    evidence: [E_PIPELINE, E_INVOICES, E_SETTLE],
  },
  {
    id: 'spine-business-records',
    label: 'Business records (ledger, stock, reports)',
    areaIds: ['CP-15', 'CP-22', 'CP-06'],
    evidence: [E_INVOICES, E_STOCK, E_AUDIT],
  },
];

export const INVOICE_BRANCHES: InvoiceBranch[] = [
  {
    id: 'customer-history',
    label: 'Customer history & wallet',
    areaIds: ['CP-06', 'CP-14'],
    evidence: [E_AUDIT, 'src/hair/domain/ledger/service.ts', 'fyh_customer_timeline'],
  },
  {
    id: 'staff-attribution',
    label: 'Staff attribution',
    areaIds: ['CP-07', 'CP-14', 'CP-22'],
    evidence: [E_SALON_BRAIN, 'fyh_invoice_line_attributions', E_AUDIT],
  },
  {
    id: 'revenue',
    label: 'Revenue',
    areaIds: ['CP-01', 'CP-22'],
    evidence: [E_NAV, E_AUDIT, '/dashboard/revenue'],
  },
  {
    id: 'financial-ledger',
    label: 'Financial ledger',
    areaIds: ['CP-13', 'CP-14', 'CP-06'],
    evidence: [E_AUDIT, 'fyh_financial_ledger', E_INVOICES],
  },
  {
    id: 'commission',
    label: 'Commission',
    areaIds: ['CP-07', 'CP-14', 'CP-20'],
    evidence: [E_SALON_BRAIN, 'applyLegacyServiceCommission', 'src/hair/services/commissionEngine.ts'],
  },
  {
    id: 'inventory',
    label: 'Inventory (consumables on pay)',
    areaIds: ['CP-15', 'CP-10', 'CP-14'],
    evidence: [E_STOCK, E_AUDIT, E_SALON_BRAIN],
  },
  {
    id: 'reports',
    label: 'Reports',
    areaIds: ['CP-22', 'CP-14'],
    evidence: [E_NAV, E_AUDIT, E_SALON_BRAIN],
  },
];

export const WORKFLOWS: Record<string, WorkflowDetail> = {
  appointments: {
    areaIds: ['CP-10', 'CP-06', 'CP-08', 'CP-07', 'CP-12'],
    who: ['Salon staff with page:appointments', 'Operational stylist (fyh_staff FK)'],
    action: [
      'Create / reschedule / cancel / no-show via calendar UI',
      'Conflict detection on book',
      'Checkout builds basket and redirects to Quick Sale or checkoutFromBasket',
    ],
    data: ['fyh_appointments', 'fyh_appointment_services', 'fyh_staff', 'fyh_resources', 'location_id'],
    rules: ['BR-08 appointment checkout → basket → Quick Sale URL', 'Status: booked → arrived → in_service → completed / cancelled / no_show'],
    result: ['Appointment linked to invoice_id when paid'],
    sideEffects: ['applyMovement for service consumables when deductInventory on pay', 'fyh_invoice_line_attributions from checkout'],
    reporting: ['Staff performance via attributions', 'Appointment-driven revenue in reports'],
    evidence: [E_APPOINTMENTS, E_AUDIT, E_SALON_BRAIN],
  },
  'walk-ins': {
    areaIds: ['CP-11', 'CP-06', 'CP-12'],
    who: ['Cashier / biller with page:quick_sale', 'Staff via 9-dot Express Sale launcher (F-52)'],
    action: [
      'Open /quick-sale (hidden from main nav)',
      'Select customer and catalog lines from loadBillableCatalog',
      'priceBasket then checkoutFromBasket or hold bill (HOLD-*)',
    ],
    data: ['fyh_customers', 'fyh_services', 'fyh_products', 'Basket snapshot', 'fyh_invoices source=quick_sale'],
    rules: ['BR-01 checkout SSOT', 'BR-06 Quick Sale source tag', 'BR-07 hold bills draft', 'ISS-11 retail stock not deducted on pay (next phase)'],
    result: ['Paid invoice with lines and payments'],
    sideEffects: ['Ledger, commission dual-write, optional consumables only on appointment path — not retail QS pay'],
    reporting: ['Revenue reports', 'Staff attributions when lines attributed'],
    evidence: [E_FEATURES, E_PIPELINE, E_SALON_BRAIN, E_CATALOG],
  },
  'billing-pos': {
    areaIds: ['CP-12', 'CP-11', 'CP-10', 'CP-13'],
    who: ['Staff with page:billing', 'page:quick_sale + action:billing.checkout'],
    action: [
      'Billing hub /billing/invoices',
      'Quick Sale checkout and advance payment modal (9-dot)',
      'Hold bill finalize re-enters checkoutFromBasket',
    ],
    data: ['fyh_invoices', 'fyh_invoice_lines', 'fyh_invoice_payments', 'Basket', 'Hold invoice ids'],
    rules: ['BR-01 checkoutFromBasket transactional SSOT', 'validateCheckout payments', 'Gift cards blocked (ISS-08)'],
    result: ['Invoice persisted with settlement summary for display'],
    sideEffects: ['applyPaidSideEffects: ledger, commission, stock consumables, package/membership activation on sale lines'],
    reporting: ['GST, payments, discounts reports', 'Dashboard revenue KPIs'],
    evidence: [E_PIPELINE, E_INVOICES, E_AUDIT, E_FEATURES],
  },
  customers: {
    areaIds: ['CP-06'],
    who: ['Staff with page:customers'],
    action: ['List / create / detail CRM', 'Notes and timeline', 'Archive (is_active) — no hard delete restore per UAT-M9'],
    data: ['fyh_customers', 'fyh_customer_notes', 'fyh_customer_timeline', 'wallet_balance_paise cache'],
    rules: ['BR-22 wallet ledger SSOT financial_ledger', 'Duplicate phone uniqueness org-scoped when 0036 applied (BR-30)'],
    result: ['Customer profile ready for appointments and checkout'],
    sideEffects: ['Timeline events from appointments and invoices', 'Advance receive posts ledger'],
    reporting: ['Customer membership/package/loyalty reports'],
    evidence: [E_AUDIT, E_SALON_BRAIN, 'src/hair/services/customers.ts'],
  },
  payments: {
    areaIds: ['CP-13', 'CP-14', 'CP-12'],
    who: ['Billing staff', 'Cashier at Quick Sale pay'],
    action: [
      'Record payments during checkoutFromBasket',
      'Record payment on invoice detail',
      'Advance payment wallet credit (no standard invoice checkout)',
    ],
    data: ['fyh_invoice_payments', 'fyh_financial_ledger', 'summarizeInvoiceSettlement display'],
    rules: ['BR-03 display settlement', 'BR-21 advance_payment invoice source', 'BR-23 gift card blocked'],
    result: ['Invoice paid / partial / advance wallet updated'],
    sideEffects: ['Ledger entries', 'Wallet reconcile on customer'],
    reporting: ['/reports/finance/payments'],
    evidence: [E_SETTLE, E_INVOICES, E_AUDIT],
  },
  invoices: {
    areaIds: ['CP-14', 'CP-13', 'CP-22'],
    who: ['Billing staff', 'Public customer via /invoice/[n] or /i/[n]'],
    action: [
      'Register at /billing/invoices',
      'Detail /billing/[invoiceId]',
      'Cancellation / correction (invoiceCancellation)',
      'Public lookup by invoice number',
      'Print APIs',
    ],
    data: ['fyh_invoices', 'lines', 'payments', 'credit notes', 'per-org sequences when SaaS'],
    rules: ['BR-13 per-org numbering when SaaS', 'BR-26 public lookup tenant rules', 'ISS-02 cross-tenant risk'],
    result: ['Invoice lifecycle with display status from summarizeInvoiceSettlement'],
    sideEffects: ['Attributions, ledger, notification outbox enqueue (delivery stub)'],
    reporting: ['All revenue and finance reports', 'Public share link'],
    evidence: [E_INVOICES, E_SAAS, E_AUDIT, E_SALON_BRAIN],
  },
  inventory: {
    areaIds: ['CP-15', 'CP-16', 'CP-09'],
    who: ['Admin with page:inventory', 'Purchasing with page:purchases'],
    action: [
      'Stock levels / movements / adjustments',
      'ERP purchases /purchases vs legacy /inventory/purchases',
      'Vendor ledger and payments',
      'On-floor stock read-only',
    ],
    data: ['fyh_stock_movements', 'fyh_location_stock', 'fyh_products', 'fyh_purchases', 'fyh_vendors'],
    rules: ['BR-09 applyMovement SSOT', 'ISS-06 dual purchase/vendor paths', 'ISS-12 transfers placeholder'],
    result: ['Stock ledger updated on inward movements and appointment consumable pay'],
    sideEffects: ['Vendor AP from purchaseBrain', 'No Quick Sale retail decrement (ISS-11)'],
    reporting: ['/reports/inventory/*', 'low-stock report'],
    evidence: [E_STOCK, E_AUDIT, E_SALON_BRAIN],
  },
  organization: {
    areaIds: ['CP-02'],
    who: ['Platform admin', 'Org owner at /select-organization when FYH_SAAS_TENANT'],
    action: ['Platform org CRUD', 'Org picker bind cookie fyh_org_id'],
    data: ['platform.organizations', 'Hair organization_id mirror'],
    rules: ['BR-10 orgFilter no-op unless FYH_SAAS_TENANT=1', 'ISS-01 tenant isolation'],
    result: ['Tenant context for scoped queries when flag on'],
    sideEffects: ['Invoice/customer sequences per org when SaaS'],
    reporting: ['Platform activity admin'],
    evidence: [E_SAAS, E_AUDIT, E_TENANT],
  },
  locations: {
    areaIds: ['CP-03'],
    who: ['Platform admin', 'Salon staff via location cookie'],
    action: ['Platform locations', 'location_id on scoped transactions'],
    data: ['platform.locations', 'fyh_staff_locations', 'fyh_location_stock'],
    rules: ['locationFilter gated like orgFilter', 'Catalog largely org-wide per audit Part 17'],
    result: ['Location-scoped appointments, invoices, stock, attendance'],
    sideEffects: ['Transfers not implemented (F-20)'],
    reporting: ['Location-scoped expenses and stock when set'],
    evidence: [E_SALON_BRAIN, E_AUDIT],
  },
  'roles-permissions': {
    areaIds: ['CP-05'],
    who: ['Super admin', 'Owner with permissions.manage'],
    action: ['Settings /settings/permissions', 'Workforce grants', 'Legacy page:* via bridge'],
    data: ['wf_permission_grants', 'fyh_admin_users', 'page:* keys'],
    rules: ['BR-11 front desk nav profile', 'BR-12 super_admin all legacy', 'ISS-05 dual RBAC'],
    result: ['Nav and actions filtered by permission'],
    sideEffects: ['hairAdminBridge lossy mapping to legacy keys'],
    reporting: ['N/A'],
    evidence: [E_RBAC, E_NAV, E_SALON_BRAIN],
  },
  staff: {
    areaIds: ['CP-07', 'CP-21'],
    who: ['Managers (weak page:dashboard layout on /staff)'],
    action: ['Roster /staff', 'Link wf_employees to fyh_staff', 'Performance views'],
    data: ['fyh_staff', 'wf_employees', 'fyh_staff_schedules'],
    rules: ['ISS-22 weak staff route guard', 'Appointments FK fyh_staff not login role'],
    result: ['Operational staff available for calendar and attributions'],
    sideEffects: ['Workforce hire flows'],
    reporting: ['/dashboard/staff-performance', '/reports/staff/*'],
    evidence: [E_SALON_BRAIN, E_AUDIT],
  },
  services: {
    areaIds: ['CP-08'],
    who: ['Admin with page:services'],
    action: ['CRUD /services', 'Categories', 'Service consumables BOM'],
    data: ['fyh_services', 'fyh_service_categories'],
    rules: ['BR-05 service GST 18% default', 'BR-17 configuration nav group includes services'],
    result: ['Billable services in catalog adapter'],
    sideEffects: ['Consumable deduction on appointment pay when configured'],
    reporting: ['GST reports', 'staff service revenue'],
    evidence: [E_FEATURES, E_NAV, E_SALON_BRAIN],
  },
  products: {
    areaIds: ['CP-09'],
    who: ['Admin with page:settings for products routes'],
    action: ['CRUD /products', 'Opening stock via products service'],
    data: ['fyh_products', 'fyh_brands'],
    rules: ['Products under page:settings not page:products per audit'],
    result: ['Retail SKUs in catalog'],
    sideEffects: ['applyMovement on opening stock'],
    reporting: ['Inventory product reports'],
    evidence: [E_AUDIT, E_NAV],
  },
  memberships: {
    areaIds: ['CP-18'],
    who: ['Admin page:memberships', 'Front desk may see memberships nav'],
    action: ['Configure plans /memberships', 'Sale activates on checkout pay'],
    data: ['fyh_membership_plans', 'fyh_customer_memberships'],
    rules: ['ISS-10 consumption at checkout next phase — discount preview in basket only'],
    result: ['Active membership on customer after sale line'],
    sideEffects: ['Ledger / timeline events on sale'],
    reporting: ['/reports/customers/memberships'],
    evidence: [E_SALON_BRAIN, E_FEATURES, E_AUDIT],
  },
  packages: {
    areaIds: ['CP-19'],
    who: ['Admin page:packages'],
    action: ['Configure /packages', 'Sale on pay', 'Redemption next phase'],
    data: ['fyh_package_plans', 'fyh_customer_packages', 'fyh_package_credit_ledger'],
    rules: ['BR-24 package credit ledger idempotency', 'ISS-10 redemption at checkout partial'],
    result: ['Package credits on customer'],
    sideEffects: ['Credit ledger writes on redemption when implemented'],
    reporting: ['/reports/customers/packages'],
    evidence: [E_SALON_BRAIN, E_AUDIT],
  },
  loyalty: {
    areaIds: ['CP-20'],
    who: ['Staff page:customers on /loyalty'],
    action: ['Loyalty hub UI', 'No plan CRUD UI (UAT-M7)'],
    data: ['Wallet on fyh_customers — no fyh_loyalty_plans table'],
    rules: ['ISS-14 loyalty plan CRUD missing'],
    result: ['Partial earn/spend via wallet and membership discount'],
    sideEffects: ['Notification panel can trigger outbox batch manually'],
    reporting: ['/reports/customers/loyalty partial'],
    evidence: [E_SALON_BRAIN, E_AUDIT],
  },
  'workforce-attendance': {
    areaIds: ['CP-21'],
    who: ['Employees /attendance', 'Managers /attendance/manage', 'HR /workforce/operations partial'],
    action: ['Self check-in', 'Team manage', 'Geolocation map partial'],
    data: ['wf_attendance', 'wf_schedules', 'location_id'],
    rules: ['requireHairHost on salary expenses path', 'wf_auth_sessions lacks org_id (SAAS_READINESS)'],
    result: ['Attendance records for payroll ops'],
    sideEffects: ['Dashboard staff-on-schedule KPI uses salon TZ (UAT-C2)'],
    reporting: ['Staff performance indirect via attributions not attendance alone'],
    evidence: [E_SALON_BRAIN, E_SAAS, E_AUDIT],
  },
  reports: {
    areaIds: ['CP-22'],
    who: ['Admin page:reports'],
    action: ['Hub /reports and finance/inventory/staff/customer subroutes'],
    data: ['Invoices, payments, attributions, stock_movements'],
    rules: ['BR-04 staff reports use attributions not raw lines', 'ISS-15 TZ edges week/month'],
    result: ['Operational analytics views'],
    sideEffects: ['N/A'],
    reporting: ['Self — report outputs'],
    evidence: [E_NAV, E_AUDIT, E_SALON_BRAIN],
  },
  notifications: {
    areaIds: ['CP-23'],
    who: ['Admin loyalty panel for batch process'],
    action: ['Enqueue fyh_notification_outbox', 'processOutboxBatchAction manual'],
    data: ['fyh_notification_templates', 'fyh_notification_outbox'],
    rules: ['ISS-07 delivery stub', 'ISS-16 no Hair cron'],
    result: ['Rows queued — not delivered to WhatsApp/SMS'],
    sideEffects: ['None until adapter wired'],
    reporting: ['N/A'],
    evidence: [E_SALON_BRAIN, E_AUDIT],
  },
  settings: {
    areaIds: ['CP-24', 'CP-01'],
    who: ['Admin page:settings', 'Super admin historical import'],
    action: [
      'Salon, GST invoice, billing, inventory, printer, WhatsApp, communication, appearance, attendance, permissions, security',
      '/settings/historical-import super-admin only',
    ],
    data: ['fyh_settings'],
    rules: ['action:settings.edit on salon settings', 'WhatsApp/communication UI partial'],
    result: ['Salon-operational configuration persisted'],
    sideEffects: ['Printer and GST affect invoice print'],
    reporting: ['N/A'],
    evidence: [E_AUDIT, E_NAV, E_CORE_MODEL],
  },
  expenses: {
    areaIds: ['CP-17'],
    who: ['Staff page:expenses', 'Owner salary expenses host-guarded'],
    action: ['Record expenses', '9-dot Add Expense modal', '/expenses/salary'],
    data: ['fyh_expenses', 'location_id', 'sector field migration 0052'],
    rules: ['BR-28 expenses sector'],
    result: ['Expense rows for P&L style tracking'],
    sideEffects: ['N/A to billing SSOT'],
    reporting: ['Finance reports indirect'],
    evidence: [E_NAV, E_AUDIT],
  },
  'vendors-purchases': {
    areaIds: ['CP-16'],
    who: ['page:purchases vs page:inventory paths'],
    action: ['ERP /purchases', 'Legacy /inventory/purchases', '/vendors vs /inventory/vendors'],
    data: ['fyh_vendors', 'fyh_purchases', 'fyh_purchase_orders'],
    rules: ['BR-27 vendor AP purchaseBrain', 'ISS-06 duplicate UIs'],
    result: ['Stock inward via applyMovement on ERP path'],
    sideEffects: ['Risk duplicate inward stock if both paths used'],
    reporting: ['Vendor statement PDF API'],
    evidence: [E_AUDIT, E_SALON_BRAIN],
  },
  'subscription-platform': {
    areaIds: ['CP-25'],
    who: ['Platform admin', 'FYTECH operators'],
    action: ['Plans, subscriptions, Stripe webhook', 'Manual payment submissions'],
    data: ['platform.organization_subscriptions', 'platform.plans'],
    rules: ['Stripe working on platform — Hair feature gates TO BE DEFINED per audit Part 28'],
    result: ['Org entitled on platform DB'],
    sideEffects: ['No FK to Hair DB'],
    reporting: ['Platform admin activity'],
    evidence: [E_SALON_BRAIN, E_SAAS, E_AUDIT],
  },
  'salon-setup': {
    areaIds: ['CP-01'],
    who: ['Owner, manager dashboards'],
    action: ['Revenue / staff-performance / front-desk dashboards', 'Landing post-login unclear'],
    data: ['Dashboard queries', 'financialDashboard'],
    rules: ['page:dashboard_* permissions', 'Front desk uses FRONT_DESK_NAV_ENTRIES'],
    result: ['KPI views for day operations'],
    sideEffects: ['Staff-on-schedule KPI salon TZ'],
    reporting: ['Dashboard is reporting entry'],
    evidence: [E_NAV, E_SALON_BRAIN, 'docs/foryourhair/IMPLEMENTATION_REPORT.md'],
  },
  users: {
    areaIds: ['CP-04'],
    who: ['Org owner /team', 'Platform /platform/admin/users'],
    action: ['Platform invites accept-invite', 'Team member detail on Hair host'],
    data: ['platform.memberships', 'platform.invitations'],
    rules: ['ISS-23 /team is platform not HR workforce', 'F-34 platform team not fyh_staff'],
    result: ['Org membership for salon login context'],
    sideEffects: ['linkWorkforcePlatformMembership'],
    reporting: ['N/A'],
    evidence: [E_SALON_BRAIN, E_AUDIT],
  },
};

export const CONFIG_GROUPS: ConfigGroup[] = [
  {
    id: 'identity',
    label: 'Identity & access',
    items: [
      {
        key: 'roles-permissions',
        label: 'Roles & permissions (workforce + legacy bridge)',
        configLevel: 'CURRENTLY_CONFIGURABLE',
        notes: 'Settings permissions UI; workforce grants; legacy page:* via bridge (lossy).',
        evidence: [E_RBAC, E_NAV, E_SALON_BRAIN],
      },
      {
        key: 'users-team',
        label: 'Platform team invites (/team)',
        configLevel: 'PLATFORM_CONTROLLED',
        notes: 'Platform memberships — not fyh_staff HR roster.',
        evidence: [E_SALON_BRAIN, E_AUDIT],
      },
      {
        key: 'forgot-password',
        label: 'Password reset',
        configLevel: 'TO_BE_DEFINED',
        notes: 'Login placeholder broken (ISS-09) — platform reset flow not implemented.',
        evidence: [E_SALON_BRAIN, E_AUDIT],
      },
    ],
  },
  {
    id: 'business',
    label: 'Business profile',
    items: [
      {
        key: 'salon-name-branding',
        label: 'Salon name, logo, branding',
        configLevel: 'CURRENTLY_CONFIGURABLE',
        notes: '/settings/salon, /settings/appearance (partial).',
        evidence: [E_CORE_MODEL, E_AUDIT],
      },
      {
        key: 'locations-hours',
        label: 'Locations & hours',
        configLevel: 'TARGET_CONFIGURABLE',
        notes: 'Platform locations + salon settings; multi-location transfers TBD-08.',
        evidence: [E_CORE_MODEL, E_SALON_BRAIN],
      },
      {
        key: 'numbering-currency-tz',
        label: 'Numbering, currency, timezone, language',
        configLevel: 'TO_BE_DEFINED',
        notes: 'Cells without audit evidence remain TO BE DEFINED per CORE-PRODUCT-MODEL.',
        evidence: [E_CORE_MODEL],
      },
    ],
  },
  {
    id: 'pricing',
    label: 'Pricing & tax',
    items: [
      {
        key: 'services-prices',
        label: 'Services & prices',
        configLevel: 'CURRENTLY_CONFIGURABLE',
        notes: '/services; default 18% GST (BR-05).',
        evidence: [E_FEATURES, E_SALON_BRAIN],
      },
      {
        key: 'products-prices',
        label: 'Products & prices',
        configLevel: 'CURRENTLY_CONFIGURABLE',
        notes: '/products under page:settings.',
        evidence: [E_AUDIT, E_NAV],
      },
      {
        key: 'gst-tax',
        label: 'GST / tax rules',
        configLevel: 'CURRENTLY_CONFIGURABLE',
        notes: '/settings/gst-invoice; SALON_GST_BPS 1800 until full settings wiring per SAAS_READINESS.',
        evidence: [E_SAAS, 'src/hair/lib/taxConfig.ts'],
      },
      {
        key: 'memberships-packages-pricing',
        label: 'Memberships & packages',
        configLevel: 'CURRENTLY_CONFIGURABLE',
        notes: 'Configuration nav group (BR-17).',
        evidence: [E_NAV, E_SALON_BRAIN],
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      {
        key: 'appointment-rules',
        label: 'Appointment & cancellation rules',
        configLevel: 'TO_BE_DEFINED',
        notes: 'Listed in configuration matrix without detailed audit cells.',
        evidence: [E_CORE_MODEL],
      },
      {
        key: 'inventory-rules',
        label: 'Inventory rules',
        configLevel: 'CURRENTLY_CONFIGURABLE',
        notes: '/settings/inventory.',
        evidence: [E_AUDIT],
      },
      {
        key: 'attendance-settings',
        label: 'Attendance settings',
        configLevel: 'CURRENTLY_CONFIGURABLE',
        notes: '/settings/attendance.',
        evidence: [E_AUDIT],
      },
      {
        key: 'payment-methods',
        label: 'Payment methods',
        configLevel: 'CURRENTLY_CONFIGURABLE',
        notes: '/settings/billing; gift cards broken at pay layer.',
        evidence: [E_AUDIT, E_SALON_BRAIN],
      },
    ],
  },
  {
    id: 'customer',
    label: 'Customer',
    items: [
      {
        key: 'customer-fields',
        label: 'Customer custom fields',
        configLevel: 'TO_BE_DEFINED',
        notes: 'Named in configuration matrix; no dedicated audit route cited.',
        evidence: [E_CORE_MODEL],
      },
      {
        key: 'loyalty-membership-package-config',
        label: 'Loyalty / membership / package programs',
        configLevel: 'CURRENTLY_CONFIGURABLE',
        notes: 'Memberships & packages working; loyalty plan CRUD UI missing (ISS-14).',
        evidence: [E_SALON_BRAIN, E_AUDIT],
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance & documents',
    items: [
      {
        key: 'invoice-receipt',
        label: 'Invoice & receipt settings',
        configLevel: 'CURRENTLY_CONFIGURABLE',
        notes: '/settings/gst-invoice, /settings/printer.',
        evidence: [E_AUDIT],
      },
      {
        key: 'vendors',
        label: 'Vendors',
        configLevel: 'CURRENTLY_CONFIGURABLE',
        notes: 'Dual routes ISS-06.',
        evidence: [E_SALON_BRAIN],
      },
      {
        key: 'expenses',
        label: 'Expenses categories / sector',
        configLevel: 'CURRENTLY_CONFIGURABLE',
        notes: 'fyh_expenses with sector field.',
        evidence: [E_AUDIT],
      },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    items: [
      {
        key: 'notifications',
        label: 'Notification templates & channels',
        configLevel: 'TARGET_CONFIGURABLE',
        notes: 'Schema + enqueue implemented; WhatsApp/SMS not wired (ISS-07).',
        evidence: [E_SALON_BRAIN, E_AUDIT],
      },
      {
        key: 'whatsapp-communication-settings',
        label: 'WhatsApp & communication settings',
        configLevel: 'CURRENTLY_CONFIGURABLE',
        notes: '/settings/whatsapp and /settings/communication partial UI (audit Part 2).',
        evidence: [E_AUDIT],
      },
    ],
  },
  {
    id: 'platform',
    label: 'Platform & subscription',
    items: [
      {
        key: 'subscription-limits',
        label: 'Subscription limits & entitlements',
        configLevel: 'PLATFORM_CONTROLLED',
        notes: 'platform.organization_entitlements; Hair gates TO BE DEFINED.',
        evidence: [E_AUDIT, E_SAAS],
      },
      {
        key: 'saas-tenant-flag',
        label: 'FYH_SAAS_TENANT enforcement',
        configLevel: 'PLATFORM_CONTROLLED',
        notes: 'Opt-in orgFilter — default single salon.',
        evidence: [E_SAAS, E_TENANT],
      },
    ],
  },
];

export const ROLE_JOURNEYS: RoleJourney[] = [
  {
    role: 'owner',
    steps: [
      { label: 'Full HAIR_NAV_ENTRIES (dashboard revenue, staff performance, customers, appointments, billing, staff, attendance→manage, purchases, expenses, loyalty, reports, configuration, settings)', evidence: [E_NAV, E_SALON_BRAIN] },
      { label: 'Platform membership role owner / co_owner (tenantAccessRoles.ts)', evidence: [E_SALON_BRAIN, 'src/platform/lib/tenantAccessRoles.ts'] },
      { label: 'Workforce job_role owner on wf_engine_memberships', evidence: [E_SALON_BRAIN, E_AUDIT] },
      { label: 'Salary expenses /expenses/salary (requireHairHost)', evidence: [E_AUDIT, E_NAV] },
      { label: 'Settings permissions + historical import (super admin path)', evidence: [E_AUDIT, E_RBAC] },
    ],
  },
  {
    role: 'manager',
    steps: [
      { label: 'Dashboard revenue & staff performance when page:dashboard_revenue / page:dashboard_staff granted', evidence: [E_NAV, E_AUDIT] },
      { label: 'Team attendance /attendance/manage when page:dashboard', evidence: [E_NAV, 'resolveAttendanceNavHref'] },
      { label: 'Staff roster /staff (layout weak page:dashboard — ISS-22)', evidence: [E_AUDIT, E_SALON_BRAIN] },
      { label: 'Reports hub when page:reports', evidence: [E_NAV] },
      { label: 'Workforce operations /workforce/operations partial', evidence: [E_SALON_BRAIN, E_AUDIT] },
    ],
  },
  {
    role: 'receptionist',
    steps: [
      { label: 'FRONT_DESK_NAV_ENTRIES when isFrontDeskNavProfile (billing without settings/inventory/reports)', evidence: [E_NAV, E_SALON_BRAIN] },
      { label: '/dashboard/front-desk', evidence: [E_NAV, E_AUDIT] },
      { label: 'Customers, appointments, billing invoices', evidence: [E_NAV] },
      { label: 'Memberships & packages links on front desk nav', evidence: [E_NAV] },
      { label: 'Platform role receptionist label in tenantAccessRoles', evidence: [E_SALON_BRAIN] },
    ],
  },
  {
    role: 'cashier',
    steps: [
      { label: 'page:quick_sale — Express Sale via 9-dot (not main nav)', evidence: [E_SALON_BRAIN, E_NAV] },
      { label: 'page:billing — invoices register and checkout actions', evidence: [E_AUDIT] },
      { label: 'Workforce biller job_role documented in product brain', evidence: [E_SALON_BRAIN] },
      { label: 'Advance payment modal via 9-dot (page:billing + action:billing.checkout)', evidence: [E_AUDIT, E_NAV] },
    ],
  },
  {
    role: 'staff-stylist',
    steps: [
      { label: 'Operational fyh_staff FK for appointments — not necessarily login role', evidence: [E_SALON_BRAIN, E_AUDIT] },
      { label: 'Workforce job_role staff / legacy stylist mappings', evidence: [E_SALON_BRAIN] },
      { label: 'Attribution on invoice lines drives performance reports', evidence: [E_SALON_BRAIN, 'fyh_invoice_line_attributions'] },
      { label: 'Self attendance /attendance when not manager (page:appointments)', evidence: [E_NAV, E_AUDIT] },
    ],
  },
  {
    role: 'employee',
    steps: [
      { label: 'Employee portal /me (WORKFORCE_ENGINE)', evidence: [E_SALON_BRAIN, E_AUDIT] },
      { label: 'Self attendance /attendance', evidence: [E_NAV, 'S-019'] },
      { label: 'Workforce home /workforce/home', evidence: [E_AUDIT] },
      { label: 'wf_employees login via wf_auth_sessions', evidence: [E_SAAS, E_AUDIT] },
    ],
  },
];

export const BUSINESS_DAY_STAGES: BusinessDayStage[] = [
  {
    id: 'opening',
    label: 'Opening — staff on floor & attendance',
    areaIds: ['CP-21', 'CP-07', 'CP-01'],
    evidence: [E_SALON_BRAIN, 'docs/foryourhair/IMPLEMENTATION_REPORT.md', E_NAV],
  },
  {
    id: 'pre-service',
    label: 'Pre-service — calendar & customer check-in',
    areaIds: ['CP-10', 'CP-06'],
    evidence: [E_APPOINTMENTS, E_AUDIT],
  },
  {
    id: 'service-delivery',
    label: 'Service delivery — in-service appointments',
    areaIds: ['CP-10', 'CP-08', 'CP-07'],
    evidence: [E_AUDIT, E_SALON_BRAIN],
  },
  {
    id: 'checkout',
    label: 'Checkout — Quick Sale / appointment pay',
    areaIds: ['CP-11', 'CP-12', 'CP-13'],
    evidence: [E_PIPELINE, E_FEATURES, E_SALON_BRAIN],
  },
  {
    id: 'post-sale',
    label: 'Post-sale — invoice, wallet, public share',
    areaIds: ['CP-14', 'CP-06'],
    evidence: [E_INVOICES, E_AUDIT],
  },
  {
    id: 'stock-purchasing',
    label: 'Stock & purchasing (as needed)',
    areaIds: ['CP-15', 'CP-16'],
    evidence: [E_STOCK, E_AUDIT],
  },
  {
    id: 'expenses',
    label: 'Expenses capture (9-dot Add Expense)',
    areaIds: ['CP-17'],
    evidence: [E_SALON_BRAIN, E_NAV],
  },
  {
    id: 'closing',
    label: 'Closing — daily revenue & reconciliation reports',
    areaIds: ['CP-22', 'CP-01'],
    evidence: [E_NAV, '/reports/revenue/daily', 'docs/foryourhair/IMPLEMENTATION_REPORT.md'],
  },
];

export const PRODUCT_GAPS: ProductGap[] = [
  { id: 'ISS-01', title: 'Multi-tenant data leak (orgFilter off)', currentBadge: 'UNSAFE', targetBadge: 'TARGET', evidence: [E_SALON_BRAIN, E_SAAS, E_TENANT] },
  { id: 'ISS-02', title: 'Public invoice cross-tenant read', currentBadge: 'UNSAFE', targetBadge: 'TARGET', evidence: [E_SALON_BRAIN, E_INVOICES, E_SAAS] },
  { id: 'ISS-03', title: 'Catalog unscoped (loadBillableCatalog)', currentBadge: 'MISSING', targetBadge: 'TARGET', evidence: [E_SALON_BRAIN, E_CATALOG, E_SAAS] },
  { id: 'ISS-04', title: 'Services layer unguarded', currentBadge: 'PARTIAL', targetBadge: 'TARGET', evidence: [E_SALON_BRAIN, E_RBAC] },
  { id: 'ISS-05', title: 'Dual RBAC + lossy bridge', currentBadge: 'PARTIAL', targetBadge: 'TARGET', evidence: [E_SALON_BRAIN, E_RBAC, 'src/workforce/compat/hairAdminBridge.ts'] },
  { id: 'ISS-06', title: 'Dual purchase/vendor UIs', currentBadge: 'PARTIAL', targetBadge: 'TARGET', evidence: [E_SALON_BRAIN, E_AUDIT] },
  { id: 'ISS-07', title: 'Notifications not delivered', currentBadge: 'MISSING', targetBadge: 'TARGET', evidence: [E_SALON_BRAIN, E_AUDIT] },
  { id: 'ISS-08', title: 'Gift card payments fail', currentBadge: 'MISSING', targetBadge: 'TARGET', evidence: [E_SALON_BRAIN, E_AUDIT, E_PIPELINE] },
  { id: 'ISS-09', title: 'Forgot password dead', currentBadge: 'MISSING', targetBadge: 'TARGET', evidence: [E_SALON_BRAIN, E_AUDIT] },
  { id: 'ISS-10', title: 'Package/membership redemption at checkout', currentBadge: 'PARTIAL', targetBadge: 'TARGET', evidence: [E_SALON_BRAIN, E_FEATURES] },
  { id: 'ISS-11', title: 'Quick Sale retail stock not deducted', currentBadge: 'PARTIAL', targetBadge: 'TARGET', evidence: [E_SALON_BRAIN, E_STOCK] },
  { id: 'ISS-16', title: 'No Hair cron for notifications/ops', currentBadge: 'MISSING', targetBadge: 'TARGET', evidence: [E_SALON_BRAIN, E_AUDIT] },
  { id: 'ISS-19', title: 'Migration journal 0037 drift', currentBadge: 'TO_BE_DEFINED', targetBadge: 'TARGET', evidence: [E_SAAS, E_AUDIT] },
  { id: 'ISS-20', title: 'Drizzle vs 0036 uniques mismatch', currentBadge: 'TO_BE_DEFINED', targetBadge: 'TARGET', evidence: [E_SAAS, E_AUDIT] },
];

export const DECISIONS_REQUIRED: DecisionRequired[] = [
  { id: 'TBD-01', question: 'Production status of migrations 0036 / 0037 / 0039 on Hair Neon', status: 'DECISION_REQUIRED', evidence: [E_SALON_BRAIN, E_AUDIT, E_SAAS] },
  { id: 'TBD-02', question: 'Cutover date for FYH_SAAS_TENANT=1 on production', status: 'DECISION_REQUIRED', evidence: [E_SALON_BRAIN, E_CORE_MODEL, E_SAAS] },
  { id: 'TBD-03', question: 'Public invoice URL format with org scoping (ISS-02)', status: 'DECISION_REQUIRED', evidence: [E_SALON_BRAIN, E_AUDIT] },
  { id: 'TBD-04', question: 'Canonical purchase/vendor routes (ISS-06)', status: 'DECISION_REQUIRED', evidence: [E_SALON_BRAIN, E_AUDIT] },
  { id: 'TBD-05', question: 'Runtime Salon Brain module vs product brain documentation', status: 'DECISION_REQUIRED', evidence: [E_SALON_BRAIN, 'docs/ECOSYSTEM_V2_INVENTORY.md'] },
  { id: 'TBD-06', question: 'Gift cards implement vs remove (ISS-08)', status: 'DECISION_REQUIRED', evidence: [E_SALON_BRAIN, E_AUDIT] },
  { id: 'TBD-07', question: 'Notification channel priority WhatsApp vs SMS (ISS-07)', status: 'DECISION_REQUIRED', evidence: [E_SALON_BRAIN, E_AUDIT] },
  { id: 'TBD-08', question: 'Multi-location transfer workflow (F-20)', status: 'DECISION_REQUIRED', evidence: [E_SALON_BRAIN, E_AUDIT] },
  { id: 'TBD-09', question: 'Commission engine vs attribution-only future (F-39)', status: 'DECISION_REQUIRED', evidence: [E_SALON_BRAIN, E_AUDIT] },
  { id: 'TBD-10', question: 'Retail Quick Sale stock policy (ISS-11)', status: 'DECISION_REQUIRED', evidence: [E_SALON_BRAIN, E_FEATURES] },
  { id: 'TBD-11', question: 'Whether co_owner maps to workforce role', status: 'DECISION_REQUIRED', evidence: [E_SALON_BRAIN, E_AUDIT] },
  { id: 'TBD-12', question: 'External salon self-serve signup flow post-SaaS', status: 'DECISION_REQUIRED', evidence: [E_SALON_BRAIN, E_SAAS, E_CORE_MODEL] },
];

/** Stack labels for 100+ salon SaaS visual (from product tree + readiness audit). */
export const ORG_STACK_TARGET: string[] = [
  'For Your Technologies (company)',
  'Salon Software (product)',
  'Platform Administration — orgs, plans, subscriptions (Platform DB)',
  'Salon Application runtime — fyh_* + wf_* (Hair DB)',
  'Organizations / salons — FYHAIR reference + future tenants (Salon B, C, 100+)',
  'FYH_SAAS_TENANT=1 + orgFilter + NOT NULL migrations (target isolation)',
  'Per-org invoice/customer sequences (0036 / saas.ts)',
  'Workforce Engine co-located (engine id fyh_salon)',
  'Separate public marketing (/salon-software waitlist)',
];
