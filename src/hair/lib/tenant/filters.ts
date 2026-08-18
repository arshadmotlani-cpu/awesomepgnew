import { and, eq, type SQL, type AnyColumn } from 'drizzle-orm';
import type { TenantContext } from './types';
import { isFyhSaasTenantEnabled } from './flags';

export function orgFilter(
  column: AnyColumn,
  ctx?: TenantContext | null,
): SQL | undefined {
  if (!isFyhSaasTenantEnabled() || !ctx) return undefined;
  return eq(column, ctx.organizationId);
}

export function locationFilter(
  column: AnyColumn,
  ctx?: TenantContext | null,
): SQL | undefined {
  if (!isFyhSaasTenantEnabled() || !ctx) return undefined;
  return eq(column, ctx.locationId);
}

export function tenantOrgDefaults(ctx?: TenantContext | null): { organizationId?: string } {
  if (!isFyhSaasTenantEnabled() || !ctx) return {};
  return { organizationId: ctx.organizationId };
}

export function tenantLocationDefaults(ctx?: TenantContext | null): { locationId?: string } {
  if (!isFyhSaasTenantEnabled() || !ctx) return {};
  return { locationId: ctx.locationId };
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
