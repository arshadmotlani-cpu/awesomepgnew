import { and, eq, type SQL, type AnyColumn } from 'drizzle-orm';
import type { TenantContext } from './types';
import { isFyhSaasTenantEnabled } from './flags';

function requireTenantContextForFilter(ctx?: TenantContext | null): TenantContext | null {
  if (!isFyhSaasTenantEnabled()) return null;
  if (!ctx) {
    throw new Error('Tenant context is required when FYH_SAAS_TENANT is enabled');
  }
  return ctx;
}

export function orgFilter(
  column: AnyColumn,
  ctx?: TenantContext | null,
): SQL | undefined {
  const tenant = requireTenantContextForFilter(ctx);
  if (!tenant) return undefined;
  return eq(column, tenant.organizationId);
}

export function locationFilter(
  column: AnyColumn,
  ctx?: TenantContext | null,
): SQL | undefined {
  const tenant = requireTenantContextForFilter(ctx);
  if (!tenant) return undefined;
  return eq(column, tenant.locationId);
}

export function tenantOrgDefaults(ctx?: TenantContext | null): { organizationId?: string } {
  const tenant = requireTenantContextForFilter(ctx);
  if (!tenant) return {};
  return { organizationId: tenant.organizationId };
}

export function tenantLocationDefaults(ctx?: TenantContext | null): { locationId?: string } {
  const tenant = requireTenantContextForFilter(ctx);
  if (!tenant) return {};
  return { locationId: tenant.locationId };
}

export function tenantWriteDefaults(ctx?: TenantContext | null): {
  organizationId?: string;
  locationId?: string;
} {
  return { ...tenantOrgDefaults(ctx), ...tenantLocationDefaults(ctx) };
}

/** Combine drizzle `and()` args, skipping undefined tenant filters. */
export function andTenant(
  ...parts: Array<SQL | undefined>
): SQL | undefined {
  const filtered = parts.filter((p): p is SQL => p !== undefined);
  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];
  return and(...filtered);
}
