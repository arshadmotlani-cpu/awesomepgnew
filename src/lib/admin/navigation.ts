export type AdminModule =
  | 'overview'
  | 'revenue'
  | 'collections'
  | 'operations'
  | 'analytics'
  | 'system'
  | 'pgs';

export type AdminModuleMeta = {
  id: AdminModule;
  label: string;
  description: string;
  href: string;
  sidebar: boolean;
};

export const ADMIN_MODULES: Record<AdminModule, AdminModuleMeta> = {
  overview: {
    id: 'overview',
    label: 'Overview',
    description: 'Global KPIs — no resident-level data',
    href: '/admin/overview',
    sidebar: true,
  },
  revenue: {
    id: 'revenue',
    label: 'Revenue',
    description: 'Rent, electricity, deposits, extra income, PG-wise charts',
    href: '/admin/revenue',
    sidebar: true,
  },
  collections: {
    id: 'collections',
    label: 'Collections',
    description: 'Pending payments, invoices, QR approvals, paid history',
    href: '/admin/collections',
    sidebar: true,
  },
  operations: {
    id: 'operations',
    label: 'Operations',
    description: 'Beds, rooms, residents, vacating, KYC',
    href: '/admin/operations',
    sidebar: true,
  },
  analytics: {
    id: 'analytics',
    label: 'Analytics',
    description: 'Visitors, traffic, funnels, devices, locations',
    href: '/admin/analytics',
    sidebar: true,
  },
  system: {
    id: 'system',
    label: 'System health',
    description: 'Sentry, logs, uptime, failed requests',
    href: '/admin/system',
    sidebar: true,
  },
  pgs: {
    id: 'pgs',
    label: 'PGs',
    description: 'All properties — click a PG to manage',
    href: '/admin/pgs',
    sidebar: true,
  },
};

export const SIDEBAR_MODULES: AdminModuleMeta[] = Object.values(ADMIN_MODULES).filter(
  (m) => m.sidebar,
);

export function withMonth(href: string, billingMonth?: string): string {
  if (!billingMonth) return href;
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}month=${billingMonth}`;
}

export function moduleHref(module: AdminModule, billingMonth?: string): string {
  return withMonth(ADMIN_MODULES[module].href, billingMonth);
}

export function modulePgHref(
  module: Exclude<AdminModule, 'overview' | 'pgs'>,
  pgId: string,
  billingMonth?: string,
): string {
  return withMonth(`/admin/${module}/pg/${pgId}`, billingMonth);
}

export function moduleResidentHref(
  module: Exclude<AdminModule, 'overview' | 'analytics' | 'system' | 'pgs'>,
  pgId: string,
  residentId: string,
  billingMonth?: string,
): string {
  return withMonth(`/admin/${module}/pg/${pgId}/resident/${residentId}`, billingMonth);
}

/** Match pathname to a sidebar module for active state. */
export function pathnameToModule(pathname: string): AdminModule | null {
  if (pathname === '/admin' || pathname.startsWith('/admin/overview')) return 'overview';
  for (const mod of SIDEBAR_MODULES) {
    if (mod.id === 'overview') continue;
    if (pathname === mod.href || pathname.startsWith(`${mod.href}/`)) return mod.id;
  }
  return null;
}

export function isModuleActive(pathname: string, module: AdminModule): boolean {
  return pathnameToModule(pathname) === module;
}
