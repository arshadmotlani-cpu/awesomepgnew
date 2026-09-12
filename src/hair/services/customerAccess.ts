/**
 * Customer data access with field-level permission projection.
 */

import type { FyhCustomer } from '@/src/hair/db/schema';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import type { PermissionContext } from '@/src/workforce/permissions/permissionContext';
import {
  customerFieldMask,
  projectCustomerFields,
} from '@/src/workforce/permissions/fieldProjection';
import { listCustomers } from '@/src/hair/services/customers';

export async function listCustomersForActor(
  permCtx: PermissionContext,
  opts: { q?: string; includeInactive?: boolean } = {},
  ctx?: TenantContext | null,
): Promise<FyhCustomer[]> {
  const rows = await listCustomers(opts, ctx);
  const mask = customerFieldMask(permCtx.grants);
  return rows.map((row) => projectCustomerFields(row, mask));
}

export function projectCustomerForActor<T extends Record<string, unknown>>(
  permCtx: PermissionContext,
  customer: T,
): T {
  const mask = customerFieldMask(permCtx.grants);
  return projectCustomerFields(customer, mask);
}
