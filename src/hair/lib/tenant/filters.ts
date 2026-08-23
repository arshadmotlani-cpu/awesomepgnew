import { and, eq, sql, type SQL, type AnyColumn } from 'drizzle-orm';
import type { TenantContext } from './types';
import { isFyhSaasTenantEnabled } from './flags';

/**
 * Phase C: org scoping is never a no-op.
 * - SaaS on: require TenantContext and filter to that org.
 * - SaaS off: still pin to the single canonical salon via fyh_default_organization_id()
 *   (or the explicit ctx org when provided).
 */
function resolveOrgFilter(ctx?: TenantContext | null): { mode: 'ctx'; organizationId: string } | { mode: 'default' } {
  if (isFyhSaasTenantEnabled()) {
    if (!ctx?.organizationId) {
      throw new Error('Tenant context is required when FYH_SAAS_TENANT is enabled');
    }
    return { mode: 'ctx', organizationId: ctx.organizationId };
  }
  if (ctx?.organizationId) return { mode: 'ctx', organizationId: ctx.organizationId };
  return { mode: 'default' };
}

export function orgFilter(column: AnyColumn, ctx?: TenantContext | null): SQL {
  const resolved = resolveOrgFilter(ctx);
  if (resolved.mode === 'ctx') return eq(column, resolved.organizationId);
  return sql`${column} = fyh_default_organization_id()`;
}

export function locationFilter(column: AnyColumn, ctx?: TenantContext | null): SQL | undefined {
  if (isFyhSaasTenantEnabled()) {
    if (!ctx?.locationId) {
      throw new Error('Tenant context is required when FYH_SAAS_TENANT is enabled');
    }
    return eq(column, ctx.locationId);
  }
  if (ctx?.locationId) return eq(column, ctx.locationId);
  // Single-salon mode: location defaults exist on columns; do not force a location filter
  // when callers omit ctx (some org-only tables have no location).
  return undefined;
}

export function tenantOrgDefaults(ctx?: TenantContext | null): {
  organizationId?: string;
} {
  if (isFyhSaasTenantEnabled()) {
    if (!ctx?.organizationId) {
      throw new Error('Tenant context is required when FYH_SAAS_TENANT is enabled');
    }
    return { organizationId: ctx.organizationId };
  }
  if (ctx?.organizationId) return { organizationId: ctx.organizationId };
  // DB column DEFAULT fyh_default_organization_id() applies when omitted.
  return {};
}

export function tenantLocationDefaults(ctx?: TenantContext | null): { locationId?: string } {
  if (isFyhSaasTenantEnabled()) {
    if (!ctx?.locationId) {
      throw new Error('Tenant context is required when FYH_SAAS_TENANT is enabled');
    }
    return { locationId: ctx.locationId };
  }
  if (ctx?.locationId) return { locationId: ctx.locationId };
  return {};
}

/** Plain UUID writes only — never SQL expressions (those break Drizzle $inferInsert). */
export function tenantWriteDefaults(ctx?: TenantContext | null): {
  organizationId?: string;
  locationId?: string;
} {
  return { ...tenantOrgDefaults(ctx), ...tenantLocationDefaults(ctx) };
}

/** Combine drizzle `and()` args, skipping undefined tenant filters. */
export function andTenant(...parts: Array<SQL | undefined>): SQL | undefined {
  const filtered = parts.filter((p): p is SQL => p !== undefined);
  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];
  return and(...filtered);
}
