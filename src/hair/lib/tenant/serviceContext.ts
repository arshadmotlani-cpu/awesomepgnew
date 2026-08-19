import { resolveTenantContextOptional } from './getTenantContext';
import { isFyhSaasTenantEnabled } from './flags';
import type { TenantContext } from './types';

/**
 * Services may receive an explicit tenant context from pages/actions.
 * When SaaS mode is on and callers omit it, resolve the current request context
 * so service-layer queries fail closed instead of running unscoped.
 */
export async function resolveTenantContextForService(
  ctx?: TenantContext | null,
): Promise<TenantContext | null> {
  if (ctx) return ctx;
  if (!isFyhSaasTenantEnabled()) return null;
  return resolveTenantContextOptional();
}
