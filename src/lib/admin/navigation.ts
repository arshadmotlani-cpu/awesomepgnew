export type AdminModule =
  | 'overview'
  | 'revenue'
  | 'collections'
  | 'invoices'
  | 'deposits'
  | 'checkoutSettlements'
  | 'pgs'
  | 'residents'
  | 'kyc'
  | 'operations'
  | 'analytics'
  | 'system'
  | 'panel';

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
    description: 'Rent, electricity, deposits, collections, billing tools, and PG-wise charts',
    href: '/admin/revenue',
    sidebar: true,
  },
  collections: {
    id: 'collections',
    label: 'Billing',
    description: 'Invoices, collections, and payment queues (under Revenue)',
    href: '/admin/revenue/billing',
    sidebar: false,
  },
  invoices: {
    id: 'invoices',
    label: 'Invoices',
    description: 'Unified billing — rent, deposit, electricity, PS4, penalties, and custom charges',
    href: '/admin/invoices',
    sidebar: true,
  },
  deposits: {
    id: 'deposits',
    label: 'Deposits',
    description: 'Deposit wallets, manual entry, refunds, and ledger',
    href: '/admin/deposits',
    sidebar: true,
  },
  checkoutSettlements: {
    id: 'checkoutSettlements',
    label: 'Checkout settlements',
    description: 'Unified vacating checkout — deposit, electricity, notice deduction, and refund',
    href: '/admin/checkout-settlements',
    sidebar: true,
  },
  pgs: {
    id: 'pgs',
    label: 'PGs',
    description: 'All properties — click a PG to manage',
    href: '/admin/pgs',
    sidebar: true,
  },
  residents: {
    id: 'residents',
    label: 'Residents',
    description: 'Verified tenants (KYC or payment approved) — assign beds after verification',
    href: '/admin/residents',
    sidebar: true,
  },
  kyc: {
    id: 'kyc',
    label: 'KYC review',
    description: 'Verify Aadhaar and selfie uploads — approve before check-in',
    href: '/admin/residents/kyc',
    sidebar: true,
  },
  operations: {
    id: 'operations',
    label: 'Operations',
    description: 'Resident ops dashboard, payment reviews, beds, vacating, and KYC',
    href: '/admin/operations/residents',
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
  panel: {
    id: 'panel',
    label: 'Admin panel',
    description: 'Rent audit, payment links, coupons, permissions, manual controls',
    href: '/admin/panel',
    sidebar: true,
  },
};

export const SIDEBAR_MODULES: AdminModuleMeta[] = Object.values(ADMIN_MODULES).filter(
  (m) => m.sidebar,
);

export function moduleKycVerifyHref(submissionId: string): string {
  return `/admin/residents/kyc/${submissionId}`;
}

export function withMonth(href: string, billingMonth?: string): string {
  if (!billingMonth) return href;
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}month=${billingMonth}`;
}

export function moduleHref(module: AdminModule, billingMonth?: string): string {
  return withMonth(ADMIN_MODULES[module].href, billingMonth);
}

export function modulePgHref(
  module: Exclude<AdminModule, 'overview' | 'pgs' | 'panel'>,
  pgId: string,
  billingMonth?: string,
): string {
  return withMonth(`/admin/${module}/pg/${pgId}`, billingMonth);
}

export function moduleResidentHref(
  module: Exclude<
    AdminModule,
    'overview' | 'analytics' | 'system' | 'pgs' | 'residents' | 'kyc' | 'panel'
  >,
  pgId: string,
  residentId: string,
  billingMonth?: string,
): string {
  return withMonth(`/admin/${module}/pg/${pgId}/resident/${residentId}`, billingMonth);
}

/** Match pathname to a sidebar module for active state. */
export function pathnameToModule(pathname: string): AdminModule | null {
  if (pathname === '/admin' || pathname.startsWith('/admin/overview')) return 'overview';
  if (pathname.startsWith('/admin/residents/kyc') || pathname.startsWith('/admin/kyc')) {
    return 'kyc';
  }
  if (
    pathname.startsWith('/admin/residents') ||
    pathname.startsWith('/admin/bookings/new')
  ) {
    return 'residents';
  }
  if (pathname.startsWith('/admin/panel')) return 'panel';
  if (pathname.startsWith('/admin/uploads')) return 'system';
  if (pathname.startsWith('/admin/pricing')) return 'pgs';
  if (pathname.startsWith('/admin/deposits')) return 'deposits';
  if (pathname.startsWith('/admin/revenue/billing') || pathname.startsWith('/admin/collections')) {
    return 'revenue';
  }
  for (const mod of SIDEBAR_MODULES) {
    if (mod.id === 'overview') continue;
    if (pathname === mod.href || pathname.startsWith(`${mod.href}/`)) return mod.id;
  }
  return null;
}

export function isModuleActive(pathname: string, module: AdminModule): boolean {
  return pathnameToModule(pathname) === module;
}
