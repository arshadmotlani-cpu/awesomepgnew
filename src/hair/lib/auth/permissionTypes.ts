/** Page access keys — control nav visibility and route guards. */
export const HAIR_PAGE_PERMISSIONS = [
  'page:dashboard',
  'page:customers',
  'page:appointments',
  'page:billing',
  'page:quick_sale',
  'page:inventory',
  'page:purchases',
  'page:expenses',
  'page:reports',
  'page:settings',
] as const;

/** Action keys — gate destructive or sensitive server actions. */
export const HAIR_ACTION_PERMISSIONS = [
  'action:inventory.adjust',
  'action:billing.checkout',
  'action:reports.export',
  'action:settings.edit',
  'action:staff.commission_pay',
  'action:import.historical',
] as const;

export const HAIR_PERMISSIONS = [
  ...HAIR_PAGE_PERMISSIONS,
  ...HAIR_ACTION_PERMISSIONS,
] as const;

export type HairPagePermission = (typeof HAIR_PAGE_PERMISSIONS)[number];
export type HairActionPermission = (typeof HAIR_ACTION_PERMISSIONS)[number];
export type HairPermission = (typeof HAIR_PERMISSIONS)[number];

export type FyhAdminRole = 'admin' | 'super_admin';

/** Default keys granted to the `admin` role when permissions jsonb is empty. */
export const ROLE_PRESETS: Record<FyhAdminRole, readonly HairPermission[]> = {
  super_admin: HAIR_PERMISSIONS,
  admin: [
    'page:dashboard',
    'page:customers',
    'page:appointments',
    'page:billing',
    'page:quick_sale',
    'action:billing.checkout',
  ],
};

export const PERMISSIONS_CATALOG: ReadonlyArray<{
  key: HairPermission;
  label: string;
  group: 'page' | 'action';
  description: string;
}> = [
  { key: 'page:dashboard', label: 'Dashboard', group: 'page', description: 'Live business intelligence dashboards' },
  { key: 'page:customers', label: 'Customers', group: 'page', description: 'CRM and profiles' },
  { key: 'page:appointments', label: 'Appointments', group: 'page', description: 'Calendar and booking' },
  { key: 'page:billing', label: 'Billing', group: 'page', description: 'Invoices and payments' },
  { key: 'page:quick_sale', label: 'Quick Sale', group: 'page', description: 'POS checkout' },
  { key: 'page:inventory', label: 'Inventory', group: 'page', description: 'Stock and product cost' },
  { key: 'page:purchases', label: 'Purchases', group: 'page', description: 'Record vendor purchases and stock inward' },
  { key: 'page:expenses', label: 'Expenses', group: 'page', description: 'Salon expense records' },
  { key: 'page:reports', label: 'Reports', group: 'page', description: 'Analytics and exports' },
  { key: 'page:settings', label: 'Settings', group: 'page', description: 'Salon configuration' },
  {
    key: 'action:inventory.adjust',
    label: 'Adjust stock',
    group: 'action',
    description: 'Manual stock movements and adjustments',
  },
  {
    key: 'action:billing.checkout',
    label: 'Checkout & pay',
    group: 'action',
    description: 'Create invoices and record payments',
  },
  {
    key: 'action:reports.export',
    label: 'Export reports',
    group: 'action',
    description: 'Download CSV / spreadsheet exports',
  },
  {
    key: 'action:settings.edit',
    label: 'Edit settings',
    group: 'action',
    description: 'Save salon settings and resources',
  },
  {
    key: 'action:staff.commission_pay',
    label: 'Pay commissions',
    group: 'action',
    description: 'Mark staff commissions as paid',
  },
  {
    key: 'action:import.historical',
    label: 'Import historical sales',
    group: 'action',
    description: 'Import past sales from Excel into paid invoices',
  },
];

const ALL_PERMISSIONS = new Set<HairPermission>(HAIR_PERMISSIONS);

function isHairPermission(value: unknown): value is HairPermission {
  return typeof value === 'string' && ALL_PERMISSIONS.has(value as HairPermission);
}

function parseStoredPermissions(raw: unknown): HairPermission[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isHairPermission);
}

export type PermissionAdmin = {
  role: FyhAdminRole;
  permissions: unknown;
};

/** Resolve effective permission keys for an admin (role preset or custom jsonb override). */
export function resolvePermissions(admin: PermissionAdmin): Set<HairPermission> {
  if (admin.role === 'super_admin') return new Set(HAIR_PERMISSIONS);

  const custom = parseStoredPermissions(admin.permissions);
  if (custom.length > 0) return new Set(custom);

  return new Set(ROLE_PRESETS[admin.role] ?? ROLE_PRESETS.admin);
}

export function hasPermission(admin: PermissionAdmin, key: HairPermission): boolean {
  if (admin.role === 'super_admin') return true;
  return resolvePermissions(admin).has(key);
}

/** Map public app paths to page permission keys (first match wins). */
export function pagePermissionForPath(pathname: string): HairPagePermission | null {
  let path = pathname.split('?')[0] ?? pathname;
  if (path.startsWith('/fyh')) {
    path = path.slice(4) || '/';
  }
  const rules: Array<[prefix: string, key: HairPagePermission]> = [
    ['/dashboard', 'page:dashboard'],
    ['/customers', 'page:customers'],
    ['/appointments', 'page:appointments'],
    ['/billing', 'page:billing'],
    ['/quick-sale', 'page:quick_sale'],
    ['/advance-payment', 'page:billing'],
    ['/inventory', 'page:inventory'],
    ['/vendors', 'page:inventory'],
    ['/purchases', 'page:purchases'],
    ['/expenses', 'page:expenses'],
    ['/reports', 'page:reports'],
    ['/settings', 'page:settings'],
    // Workforce pages self-guard with staff.* / finance.* — do not require settings.manage
    // (managers have staff admin without settings).
    ['/staff', 'page:dashboard'],
    ['/team', 'page:dashboard'],
    ['/services', 'page:settings'],
    ['/products', 'page:settings'],
    ['/packages', 'page:settings'],
    ['/memberships', 'page:settings'],
    ['/loyalty', 'page:customers'],
    ['/workforce', 'page:dashboard'],
    ['/me', 'page:appointments'],
  ];
  for (const [prefix, key] of rules) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return key;
  }
  return null;
}
