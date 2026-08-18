import { cache } from 'react';
import {
  resolveTenantContext,
  resolveTenantContextOptional,
} from './resolveTenantContext';
import { requireTenantContextWhenEnabled } from './requireTenantContext';
import type { TenantContext } from './types';

/** Server Components — cached per request. */
export const getTenantContextForPage = cache(async (): Promise<TenantContext | null> => {
  return resolveTenantContextOptional();
});

/** Server actions — throws when FYH_SAAS_TENANT=1 and context missing. */
export async function getTenantContextForAction(): Promise<TenantContext | null> {
  return requireTenantContextWhenEnabled();
}

export { resolveTenantContext, resolveTenantContextOptional };
