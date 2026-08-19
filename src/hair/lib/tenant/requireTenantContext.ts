import { redirect } from 'next/navigation';
import { hairAppRedirect } from '@/src/hair/lib/host';
import {
  resolveTenantContext,
  TenantContextError,
} from './resolveTenantContext';
import { isFyhSaasTenantEnabled } from './flags';
import type { TenantContext } from './types';

export async function requireTenantContext(): Promise<TenantContext> {
  if (!isFyhSaasTenantEnabled()) {
    throw new TenantContextError('FYH_SAAS_TENANT is not enabled');
  }
  const ctx = await resolveTenantContext();
  if (!ctx) throw new TenantContextError('Invalid or missing tenant context');
  return ctx;
}

export async function requireTenantContextPage(): Promise<TenantContext> {
  if (!isFyhSaasTenantEnabled()) {
    redirect(await hairAppRedirect('/login'));
  }
  const ctx = await resolveTenantContext();
  if (!ctx) redirect(await hairAppRedirect('/login?error=tenant'));
  return ctx;
}

/** For actions: returns null when SaaS tenant mode is off. */
export async function requireTenantContextWhenEnabled(): Promise<TenantContext | null> {
  if (!isFyhSaasTenantEnabled()) return null;
  return requireTenantContext();
}
