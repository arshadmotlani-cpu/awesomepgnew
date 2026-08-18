import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhCustomers } from '@/src/hair/db/schema';
import { normalizePhone, nextCustomerCode } from '@/src/hair/services/customers';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

function syntheticImportPhone(rowKey: string): string {
  const digits = rowKey.replace(/\D/g, '').slice(-10).padStart(10, '0');
  return `9${digits.slice(1)}`;
}

export async function resolveHistoricalCustomer(
  db: typeof hairDb,
  input: { fullName: string; phone?: string; rowKey: string },
  ctx?: TenantContext | null,
) {
  const name = input.fullName.trim();
  if (!name) throw new Error('customer_name is required');

  const phoneRaw = input.phone?.trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : syntheticImportPhone(input.rowKey);

  const [existing] = await db
    .select()
    .from(fyhCustomers)
    .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.phone, phone)))
    .limit(1);

  if (existing) return existing;

  const customerCode = await nextCustomerCode(db, ctx);
  const [created] = await db
    .insert(fyhCustomers)
    .values({
      ...tenantOrgDefaults(ctx),
      fullName: name,
      phone,
      source: 'other',
      customerCode,
      notes: 'Created via historical sales import',
    })
    .returning();

  if (!created) throw new Error('Failed to create import customer');
  return created;
}
