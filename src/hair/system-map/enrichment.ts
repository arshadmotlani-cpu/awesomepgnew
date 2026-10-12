import type { ImpactPreset, IssueDetail, MapNode, UserJourney } from './types';

export const HIERARCHY_MODULES: Array<
  Pick<MapNode, 'id' | 'name' | 'parent' | 'description' | 'status' | 'layer' | 'docRefs'>
> = [
  {
    id: 'N-FYTECH',
    name: 'For Your Technologies',
    parent: undefined,
    description: 'COMPANY — technology company (FYTECH ecosystem / monorepo)',
    status: 'implemented',
    docRefs: ['docs/product-brain/FYTECH-MASTER-BRAIN.md'],
  },
  {
    id: 'N-SALON-SOFTWARE',
    name: 'Salon Software',
    parent: 'N-FYTECH',
    description: 'PRODUCT — multi-tenant salon SaaS (target); codebase under src/hair, routes fyh_*',
    status: 'implemented',
  },
  {
    id: 'N-AREA-PLATFORM',
    name: 'Platform Administration',
    parent: 'N-SALON-SOFTWARE',
    description: 'Orgs, plans, subscriptions — not day-to-day salon ops',
    status: 'working',
  },
  {
    id: 'N-AREA-SALON',
    name: 'Salon Application',
    parent: 'N-SALON-SOFTWARE',
    description: 'Tenant salon ERP on Hair host',
    status: 'working',
  },
  {
    id: 'N-AREA-WF',
    name: 'Workforce',
    parent: 'N-SALON-SOFTWARE',
    description: 'wf_* tables + permissions in Hair DB',
    status: 'partial',
  },
  {
    id: 'N-AREA-PUBLIC',
    name: 'Public / Customer',
    parent: 'N-SALON-SOFTWARE',
    description: 'Public invoice, marketing surfaces',
    status: 'partial',
  },
  { id: 'MOD-DASH', name: 'Dashboard', parent: 'N-AREA-SALON', status: 'working' },
  { id: 'MOD-CRM', name: 'Customers', parent: 'N-AREA-SALON', status: 'working' },
  { id: 'MOD-APT', name: 'Appointments', parent: 'N-AREA-SALON', status: 'working' },
  { id: 'MOD-BILL', name: 'Billing', parent: 'N-AREA-SALON', status: 'working' },
  { id: 'MOD-QS', name: 'Quick Sale', parent: 'N-AREA-SALON', status: 'working' },
  { id: 'MOD-INV', name: 'Inventory', parent: 'N-AREA-SALON', status: 'partial' },
  { id: 'MOD-PUR', name: 'Purchases', parent: 'N-AREA-SALON', status: 'working' },
  { id: 'MOD-VEN', name: 'Vendors', parent: 'N-AREA-SALON', status: 'partial duplicate' },
  { id: 'MOD-SVC', name: 'Services', parent: 'N-AREA-SALON', status: 'working' },
  { id: 'MOD-PRD', name: 'Products', parent: 'N-AREA-SALON', status: 'working' },
  { id: 'MOD-MEM', name: 'Memberships', parent: 'N-AREA-SALON', status: 'working' },
  { id: 'MOD-PKG', name: 'Packages', parent: 'N-AREA-SALON', status: 'working' },
  { id: 'MOD-LOY', name: 'Loyalty', parent: 'N-AREA-SALON', status: 'partial' },
  { id: 'MOD-EXP', name: 'Expenses', parent: 'N-AREA-SALON', status: 'working' },
  { id: 'MOD-WF-OPS', name: 'Workforce ops', parent: 'N-AREA-WF', status: 'partial' },
  { id: 'MOD-ATT', name: 'Attendance', parent: 'N-AREA-WF', status: 'working' },
  { id: 'MOD-REP', name: 'Reports', parent: 'N-AREA-SALON', status: 'partial' },
  { id: 'MOD-NOT', name: 'Notifications', parent: 'N-AREA-SALON', status: 'partial stub' },
  { id: 'MOD-SET', name: 'Settings', parent: 'N-AREA-SALON', status: 'working' },
  { id: 'MOD-CFG', name: 'Configuration', parent: 'N-AREA-SALON', status: 'working' },
];

export const SPECIAL_VIEW_NODES: MapNode[] = [
  {
    id: 'VIEW-BILLING-SSOT',
    type: 'VIEW',
    name: 'BILLING SOURCE OF TRUTH',
    description: 'checkoutFromBasket — authoritative billing write path',
    layer: 'current',
    status: 'working',
    sourceFiles: ['src/hair/domain/checkout/pipeline.ts'],
    docRefs: ['docs/product-brain/FYHAIR-SALON-BRAIN.md'],
  },
  {
    id: 'VIEW-STOCK-SSOT',
    type: 'VIEW',
    name: 'STOCK SOURCE OF TRUTH',
    description: 'applyMovement — stock mutation SSOT',
    layer: 'current',
    status: 'working',
    sourceFiles: ['src/hair/services/stock.ts'],
  },
  {
    id: 'DUP-PURCHASES',
    type: 'ISSUE',
    name: 'ARCHITECTURAL DUPLICATION — Purchases',
    description: '/purchases vs /inventory/purchases',
    status: 'open',
    layer: 'current',
    knownIssues: ['ISS-06'],
  },
  {
    id: 'DUP-VENDORS',
    type: 'ISSUE',
    name: 'ARCHITECTURAL DUPLICATION — Vendors',
    description: '/vendors vs /inventory/vendors',
    status: 'open',
    layer: 'current',
    knownIssues: ['ISS-06'],
  },
];

export const ISSUE_DETAILS: IssueDetail[] = [
  {
    id: 'ISS-01',
    title: 'Multi-tenant data leak (orgFilter off)',
    status: 'OPEN',
    severity: 'critical',
    rootCause: 'FYH_SAAS_TENANT flag + incomplete orgFilter on reads/writes',
    currentState: 'Single-tenant deployments may appear fine; multi-org unsafe',
    knownFix: 'Enable tenant flag + enforce orgFilter in services (see SAAS_READINESS)',
    remainingRisk: 'Cross-tenant data exposure',
    affectedNodeIds: ['N-TENANT-001', 'N-FLAG-SAAS', 'N-SVC-CAT', 'N-DOM-CHECKOUT', 'E-H-016', 'MOD-REP'],
  },
  {
    id: 'ISS-02',
    title: 'Public invoice cross-tenant read',
    status: 'OPEN',
    severity: 'critical',
    affectedNodeIds: ['S-092', 'S-093', 'E-H-016', 'N-SVC-INV'],
    knownFix: 'Scope public lookup by org + invoice number uniqueness per org',
  },
  {
    id: 'ISS-03',
    title: 'Catalog unscoped',
    status: 'OPEN',
    severity: 'high',
    affectedNodeIds: ['N-SVC-CAT', 'MOD-SVC', 'MOD-PRD', 'S-013'],
  },
  {
    id: 'ISS-04',
    title: 'Services layer unguarded',
    status: 'OPEN',
    severity: 'high',
    affectedNodeIds: ['N-SVC-INV', 'N-SVC-APT', 'N-SVC-STOCK'],
  },
  {
    id: 'ISS-05',
    title: 'Dual RBAC + lossy bridge',
    status: 'PARTIAL',
    severity: 'high',
    affectedNodeIds: ['N-RBAC-LEG', 'N-RBAC-WF', 'N-RBAC-BRIDGE', 'MOD-SET'],
  },
  {
    id: 'ISS-06',
    title: 'Dual purchase/vendor UIs',
    status: 'OPEN',
    severity: 'medium',
    affectedNodeIds: ['S-022', 'S-072', 'S-078', 'S-075', 'DUP-PURCHASES', 'DUP-VENDORS'],
  },
  {
    id: 'ISS-07',
    title: 'Notifications not delivered',
    status: 'OPEN',
    severity: 'medium',
    affectedNodeIds: ['E-H-054', 'MOD-NOT', 'F-40'],
  },
  {
    id: 'ISS-08',
    title: 'Gift card payments fail',
    status: 'BROKEN',
    severity: 'medium',
    affectedNodeIds: ['MOD-BILL', 'F-41', 'N-DOM-CHECKOUT'],
  },
  {
    id: 'ISS-09',
    title: 'Forgot password dead',
    status: 'BROKEN',
    severity: 'medium',
    affectedNodeIds: ['S-090'],
  },
  {
    id: 'ISS-10',
    title: 'Package redemption checkout',
    status: 'PARTIAL',
    severity: 'medium',
    affectedNodeIds: ['F-42', 'S-013', 'N-DOM-CHECKOUT'],
  },
  {
    id: 'ISS-11',
    title: 'Quick Sale retail stock',
    status: 'PARTIAL',
    severity: 'medium',
    affectedNodeIds: ['F-44', 'S-013', 'N-SVC-STOCK', 'VIEW-STOCK-SSOT'],
  },
  {
    id: 'ISS-12',
    title: 'Inventory transfers placeholder',
    status: 'PLACEHOLDER',
    severity: 'low',
    affectedNodeIds: ['S-071', 'F-20'],
  },
  {
    id: 'ISS-13',
    title: 'Chair/resource admin UI',
    status: 'PARTIAL',
    severity: 'low',
    affectedNodeIds: ['F-45', 'E-H-009'],
  },
  {
    id: 'ISS-14',
    title: 'Loyalty plan CRUD UI',
    status: 'PARTIAL',
    severity: 'low',
    affectedNodeIds: ['MOD-LOY', 'F-23'],
  },
  {
    id: 'ISS-15',
    title: 'Report TZ edges',
    status: 'PARTIAL',
    severity: 'medium',
    affectedNodeIds: ['MOD-REP', 'F-28'],
  },
  {
    id: 'ISS-16',
    title: 'No Hair cron',
    status: 'OPEN',
    severity: 'medium',
    affectedNodeIds: ['MOD-NOT'],
  },
  {
    id: 'ISS-17',
    title: 'Doc "+ New" menu drift',
    status: 'HISTORICAL/doc',
    severity: 'low',
    affectedNodeIds: [],
  },
  {
    id: 'ISS-18',
    title: 'rcVisitLoop test flake',
    status: 'OPEN',
    severity: 'low',
    affectedNodeIds: ['N-DOM-CHECKOUT'],
  },
  {
    id: 'ISS-19',
    title: 'Migration journal 0037 drift',
    status: 'UNCLEAR',
    severity: 'high',
    affectedNodeIds: ['E-H-016'],
  },
  {
    id: 'ISS-20',
    title: 'Drizzle vs 0036 uniques',
    status: 'UNCLEAR',
    severity: 'high',
    affectedNodeIds: ['E-H-016', 'E-H-004'],
  },
  {
    id: 'ISS-21',
    title: 'Commission engine no-op',
    status: 'PLACEHOLDER',
    severity: 'low',
    affectedNodeIds: ['E-H-022', 'F-39'],
  },
  {
    id: 'ISS-22',
    title: 'Weak staff route guard',
    status: 'PARTIAL',
    severity: 'medium',
    affectedNodeIds: ['S-015', 'MOD-WF-OPS'],
  },
  {
    id: 'ISS-23',
    title: '/team vs workforce confusion',
    status: 'WORKING-as-designed',
    severity: 'low',
    affectedNodeIds: ['S-086', 'S-082'],
  },
  {
    id: 'ISS-24',
    title: 'Waitlist no auth/rate limit',
    status: 'OPEN',
    severity: 'low',
    affectedNodeIds: ['S-095', 'F-48'],
  },
  {
    id: 'ISS-25',
    title: 'Tenant mirror tables incomplete',
    status: 'PARTIAL',
    severity: 'medium',
    affectedNodeIds: ['E-H-058', 'N-TENANT-001'],
  },
];

export const IMPACT_PRESETS: ImpactPreset[] = [
  {
    id: 'impact-billing',
    name: 'Billing',
    seedNodeIds: ['MOD-BILL', 'N-DOM-CHECKOUT', 'VIEW-BILLING-SSOT'],
  },
  { id: 'impact-appointments', name: 'Appointments', seedNodeIds: ['MOD-APT', 'N-SVC-APT', 'N-ACT-APT'] },
  { id: 'impact-inventory', name: 'Inventory', seedNodeIds: ['MOD-INV', 'N-SVC-STOCK', 'VIEW-STOCK-SSOT'] },
  { id: 'impact-workforce', name: 'Workforce', seedNodeIds: ['N-AREA-WF', 'N-RBAC-WF', 'E-W-001'] },
  { id: 'impact-customers', name: 'Customers', seedNodeIds: ['MOD-CRM', 'E-H-004'] },
  { id: 'impact-rbac', name: 'RBAC', seedNodeIds: ['N-RBAC-LEG', 'N-RBAC-WF', 'N-RBAC-BRIDGE'] },
  { id: 'impact-tenant', name: 'Tenant', seedNodeIds: ['N-TENANT-001', 'N-FLAG-SAAS', 'TGT-SAAS-BOUNDARY'] },
  { id: 'impact-services', name: 'Services', seedNodeIds: ['MOD-SVC', 'E-H-011'] },
  { id: 'impact-products', name: 'Products', seedNodeIds: ['MOD-PRD', 'E-H-025'] },
  { id: 'impact-memberships', name: 'Memberships', seedNodeIds: ['MOD-MEM', 'E-H-044'] },
  { id: 'impact-packages', name: 'Packages', seedNodeIds: ['MOD-PKG', 'E-H-046'] },
  { id: 'impact-loyalty', name: 'Loyalty', seedNodeIds: ['MOD-LOY'] },
  { id: 'impact-reports', name: 'Reports', seedNodeIds: ['MOD-REP'] },
];

function journey(id: string, name: string, steps: { label: string; nodeId?: string }[]): UserJourney {
  return {
    id,
    name,
    steps: steps.map((s, i) => ({ id: `${id}-${i}`, label: s.label, nodeId: s.nodeId })),
  };
}

export const JOURNEYS: UserJourney[] = [
  journey('J-01', 'New customer', [
    { label: 'Customer', nodeId: 'MOD-CRM' },
    { label: 'Create profile', nodeId: 'S-008' },
    { label: 'fyh_customers', nodeId: 'E-H-004' },
  ]),
  journey('J-02', 'Appointment booking', [
    { label: 'Customer', nodeId: 'E-H-004' },
    { label: 'Appointment', nodeId: 'MOD-APT' },
    { label: 'Service + Staff', nodeId: 'E-H-014' },
  ]),
  journey('J-03', 'Appointment checkout', [
    { label: 'Appointment', nodeId: 'E-H-014' },
    { label: 'Basket', nodeId: 'N-DOM-BASKET' },
    { label: 'Quick Sale redirect', nodeId: 'S-013' },
    { label: 'checkoutFromBasket', nodeId: 'N-DOM-CHECKOUT' },
    { label: 'Invoice', nodeId: 'E-H-016' },
  ]),
  journey('J-04', 'Quick Sale', [
    { label: 'Quick Sale', nodeId: 'F-07' },
    { label: 'priceBasket', nodeId: 'N-DOM-BASKET' },
    { label: 'checkoutFromBasket', nodeId: 'VIEW-BILLING-SSOT' },
    { label: 'Payments', nodeId: 'E-H-018' },
  ]),
  journey('J-05', 'Advance payment', [
    { label: 'Advance payment', nodeId: 'S-014' },
    { label: 'Invoice', nodeId: 'E-H-016' },
  ]),
  journey('J-06', 'Invoice payment', [
    { label: 'Billing', nodeId: 'MOD-BILL' },
    { label: 'Record payment', nodeId: 'N-SVC-INV' },
    { label: 'Ledger', nodeId: 'E-H-020' },
  ]),
  journey('J-07', 'Purchase stock', [
    { label: 'Purchases ERP', nodeId: 'S-022' },
    { label: 'fyh_purchases', nodeId: 'E-H-034' },
  ]),
  journey('J-08', 'Receive stock', [
    { label: 'GRN', nodeId: 'E-H-030' },
    { label: 'applyMovement', nodeId: 'VIEW-STOCK-SSOT' },
  ]),
  journey('J-09', 'Sell retail product', [
    { label: 'Quick Sale', nodeId: 'S-013' },
    { label: 'checkout', nodeId: 'N-DOM-CHECKOUT' },
    { label: 'Stock (partial)', nodeId: 'ISS-11' },
  ]),
  journey('J-10', 'Service consumable deduction', [
    { label: 'Pay invoice', nodeId: 'N-SVC-INV' },
    { label: 'applyMovement', nodeId: 'N-SVC-STOCK' },
    { label: 'fyh_stock_movements', nodeId: 'E-H-026' },
  ]),
  journey('J-11', 'Staff creation', [
    { label: 'wf_employees', nodeId: 'E-W-001' },
    { label: 'fyh_staff', nodeId: 'E-H-007' },
  ]),
  journey('J-12', 'Staff permissions', [
    { label: 'Workforce RBAC', nodeId: 'N-RBAC-WF' },
    { label: 'hairAdminBridge', nodeId: 'N-RBAC-BRIDGE' },
    { label: 'Legacy page keys', nodeId: 'N-RBAC-LEG' },
  ]),
  journey('J-13', 'Attendance', [
    { label: 'Self attendance', nodeId: 'S-019' },
    { label: 'wf_attendance', nodeId: 'E-W-006' },
  ]),
  journey('J-14', 'Membership purchase', [
    { label: 'Memberships', nodeId: 'MOD-MEM' },
    { label: 'Checkout', nodeId: 'N-DOM-CHECKOUT' },
  ]),
  journey('J-15', 'Package purchase', [
    { label: 'Packages', nodeId: 'MOD-PKG' },
    { label: 'Checkout', nodeId: 'N-DOM-CHECKOUT' },
  ]),
  journey('J-16', 'Loyalty', [{ label: 'Loyalty hub', nodeId: 'MOD-LOY' }]),
  journey('J-17', 'Expense', [{ label: 'Expenses', nodeId: 'MOD-EXP' }, { label: 'fyh_expenses', nodeId: 'E-H-043' }]),
  journey('J-18', 'Reporting', [{ label: 'Reports', nodeId: 'MOD-REP' }]),
  journey('J-19', 'Salon onboarding', [
    { label: 'Platform org', nodeId: 'P-002' },
    { label: 'Org picker', nodeId: 'S-091' },
    { label: 'TenantContext', nodeId: 'N-TENANT-001' },
  ]),
  journey('J-20', 'Multi-location operation', [
    { label: 'Locations', nodeId: 'P-005' },
    { label: 'TenantContext location', nodeId: 'N-TENANT-001' },
    { label: 'Location stock', nodeId: 'E-H-062' },
  ]),
];

/** Detail panel enrichment for high-signal nodes */
export const NODE_DETAIL: Record<
  string,
  Partial<{
    permissions: string[];
    businessRules: string[];
    tests: string[];
    sourceFiles: string[];
    fixes: string[];
    risks: string[];
  }>
> = {
  'N-DOM-CHECKOUT': {
    sourceFiles: ['src/hair/domain/checkout/pipeline.ts'],
    businessRules: ['BR-15', 'BR-16', 'Attribution SSOT'],
    tests: ['tests/unit/*checkout*', 'rcVisitLoop.test.ts'],
    risks: ['ISS-08', 'ISS-10', 'ISS-11'],
  },
  'N-SVC-STOCK': {
    sourceFiles: ['src/hair/services/stock.ts'],
    businessRules: ['applyMovement only mutation path'],
    tests: ['tests/unit/stockService*.test.ts'],
  },
  'F-07': {
    permissions: ['page:quick_sale', 'action:billing.checkout'],
    sourceFiles: ['src/hair/actions/quickSale.ts', 'app/(hair)/fyh/(app)/quick-sale/page.tsx'],
    risks: ['ISS-11'],
  },
  'N-TENANT-001': {
    sourceFiles: ['src/hair/lib/tenant/resolveTenantContext.ts', 'src/hair/lib/tenant/filters.ts'],
    risks: ['ISS-01', 'ISS-25'],
    fixes: ['Enable FYH_SAAS_TENANT + orgFilter on all services'],
  },
};
