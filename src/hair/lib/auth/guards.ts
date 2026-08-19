import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getHairSession, type HairAdmin } from './session';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { requireTenantContext } from '@/src/hair/lib/tenant/requireTenantContext';
import { isHairHostFromHeaders, isHairHost, hairAppRedirect } from '@/src/hair/lib/host';
import {
  hasPermission,
  type HairPagePermission,
  type PermissionAdmin,
} from '@/src/hair/lib/auth/permissionTypes';

export class HairAuthError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'HairAuthError';
  }
}

export class HairHostError extends Error {
  constructor(message = 'For Your Hair host required') {
    super(message);
    this.name = 'HairHostError';
  }
}

export async function requireHairHost(): Promise<void> {
  const hdrs = await headers();
  if (!isHairHostFromHeaders(hdrs) && hdrs.get('x-hair-app') !== '1') {
    throw new HairHostError();
  }
}

export async function requireHairAuth(): Promise<HairAdmin> {
  await requireHairHost();
  const session = await getHairSession();
  if (!session) throw new HairAuthError();
  if (isFyhSaasTenantEnabled()) {
    await requireTenantContext();
  }
  return session.admin;
}

export async function requireHairAuthPage(): Promise<HairAdmin> {
  await requireHairHost();
  const session = await getHairSession();
  if (!session) redirect(await hairAppRedirect('/login'));
  if (isFyhSaasTenantEnabled()) {
    try {
      await requireTenantContext();
    } catch {
      redirect(await hairAppRedirect('/login?error=tenant'));
    }
  }
  return session.admin;
}

export async function getHairAuthOptional(): Promise<HairAdmin | null> {
  const session = await getHairSession();
  return session?.admin ?? null;
}

export async function requireSuperAdmin(): Promise<HairAdmin> {
  const admin = await requireHairAuth();
  if (admin.role !== 'super_admin') {
    throw new HairAuthError('Super admin access required');
  }
  return admin;
}

export async function requireSuperAdminPage(): Promise<HairAdmin> {
  const admin = await requireHairAuthPage();
  if (admin.role !== 'super_admin') redirect(resolveDefaultLandingPath(admin));
  return admin;
}

const LANDING_PRIORITY: Array<[HairPagePermission, string]> = [
  ['page:appointments', '/appointments'],
  ['page:dashboard', '/dashboard/revenue'],
  ['page:customers', '/customers'],
  ['page:billing', '/billing/invoices'],
  ['page:reports', '/reports'],
  ['page:inventory', '/inventory'],
  ['page:settings', '/settings'],
];

/** Role-aware post-login landing — never hardcode /dashboard parent. */
export function resolveDefaultLandingPath(admin: PermissionAdmin): string {
  if (admin.role === 'super_admin' && hasPermission(admin, 'page:dashboard')) {
    return '/dashboard/revenue';
  }
  if (hasPermission(admin, 'page:appointments')) {
    return '/appointments';
  }
  for (const [perm, path] of LANDING_PRIORITY) {
    if (hasPermission(admin, perm)) return path;
  }
  return '/appointments';
}

/** First permitted dashboard child when visiting /dashboard parent URL. */
export function resolveDashboardChildPath(admin: PermissionAdmin): string {
  if (!hasPermission(admin, 'page:dashboard')) {
    return resolveDefaultLandingPath(admin);
  }
  return '/dashboard/revenue';
}

export function safeHairNextPath(next: string, admin?: PermissionAdmin): string {
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\') || next.includes('@')) {
    return admin ? resolveDefaultLandingPath(admin) : '/appointments';
  }
  try {
    const u = new URL(next, 'https://fyhair.awesomepg.in');
    if (!isHairHost(u.hostname)) {
      return admin ? resolveDefaultLandingPath(admin) : '/appointments';
    }
    let path = u.pathname;
    if (path.startsWith('/fyh')) {
      path = path.replace(/^\/fyh/, '') || '/';
    }
    if (path === '/dashboard' || path === '/dashboard/') {
      return admin ? resolveDashboardChildPath(admin) : '/dashboard/revenue';
    }
    return path + u.search;
  } catch {
    return admin ? resolveDefaultLandingPath(admin) : '/appointments';
  }
}
