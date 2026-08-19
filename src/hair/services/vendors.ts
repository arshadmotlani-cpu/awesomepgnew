import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhVendors } from '@/src/hair/db/schema';
import { detachBrandsFromVendor, syncVendorBrands } from '@/src/hair/services/brands';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';

export type VendorInput = {
  name: string;
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  bankDetails?: string | null;
  upiId?: string | null;
  qrCodeUrl?: string | null;
  notes?: string | null;
  isActive?: boolean;
  brandNames?: string[];
};

export async function listVendors(opts?: { q?: string; status?: 'active' | 'inactive' | 'all' }, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const conditions = [orgFilter(fyhVendors.organizationId, ctx)];
  const status = opts?.status ?? 'active';
  if (status === 'active') conditions.push(eq(fyhVendors.isActive, true));
  if (status === 'inactive') conditions.push(eq(fyhVendors.isActive, false));
  const q = opts?.q?.trim();
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(fyhVendors.name, pattern),
        ilike(fyhVendors.companyName, pattern),
        ilike(fyhVendors.contactName, pattern),
        ilike(fyhVendors.phone, pattern),
        ilike(fyhVendors.email, pattern),
      )!,
    );
  }
  return hairDb
    .select()
    .from(fyhVendors)
    .where(and(...conditions))
    .orderBy(asc(fyhVendors.name))
    .limit(300);
}

export async function getVendor(id: string, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await hairDb
    .select()
    .from(fyhVendors)
    .where(and(orgFilter(fyhVendors.organizationId, ctx), eq(fyhVendors.id, id)))
    .limit(1);
  return row ?? null;
}

export async function createVendor(input: VendorInput, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const name = input.name.trim();
  if (!name) throw new Error('Vendor name is required');
  const [row] = await hairDb
    .insert(fyhVendors)
    .values({
      ...tenantOrgDefaults(ctx),
      name,
      companyName: input.companyName?.trim() || null,
      contactName: input.contactName?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      gstin: input.gstin?.trim() || null,
      address: input.address?.trim() || null,
      bankDetails: input.bankDetails?.trim() || null,
      upiId: input.upiId?.trim() || null,
      qrCodeUrl: input.qrCodeUrl?.trim() || null,
      notes: input.notes?.trim() || null,
      isActive: input.isActive !== false,
    })
    .returning();
  if (row && input.brandNames?.length) {
    await syncVendorBrands(row.id, input.brandNames, ctx);
  }
  return row;
}

export async function updateVendor(id: string, input: VendorInput, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const name = input.name.trim();
  if (!name) throw new Error('Vendor name is required');
  const [row] = await hairDb
    .update(fyhVendors)
    .set({
      name,
      companyName: input.companyName?.trim() || null,
      contactName: input.contactName?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      gstin: input.gstin?.trim() || null,
      address: input.address?.trim() || null,
      bankDetails: input.bankDetails?.trim() || null,
      upiId: input.upiId?.trim() || null,
      qrCodeUrl: input.qrCodeUrl?.trim() || null,
      notes: input.notes?.trim() || null,
      isActive: input.isActive !== false,
    })
    .where(and(orgFilter(fyhVendors.organizationId, ctx), eq(fyhVendors.id, id)))
    .returning();
  if (!row) throw new Error('Vendor not found');
  if (input.brandNames) {
    await syncVendorBrands(id, input.brandNames, ctx);
  }
  return row;
}

export async function archiveVendor(id: string, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await hairDb
    .update(fyhVendors)
    .set({ isActive: false })
    .where(and(orgFilter(fyhVendors.organizationId, ctx), eq(fyhVendors.id, id)))
    .returning();
  if (!row) throw new Error('Vendor not found');
  await detachBrandsFromVendor(id, ctx);
  return row;
}
