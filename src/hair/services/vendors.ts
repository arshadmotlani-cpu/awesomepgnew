import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhVendors } from '@/src/hair/db/schema';
import { detachBrandsFromVendor, syncVendorBrands, syncVendorBrandsInDb } from '@/src/hair/services/brands';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';
import type { HairDb } from '@/src/hair/services/stock';

export type VendorInput = {
  name: string;
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  bankDetails?: string | null;
  bankAccountHolderName?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  upiId?: string | null;
  qrCodeUrl?: string | null;
  notes?: string | null;
  isActive?: boolean;
  brandNames?: string[];
};

function normalizeVendorName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function formatBankDetailsLegacy(input: VendorInput): string | null {
  const parts = [
    input.bankAccountHolderName?.trim(),
    input.bankName?.trim(),
    input.bankAccountNumber?.trim() ? `A/C ${input.bankAccountNumber.trim()}` : null,
    input.bankIfsc?.trim() ? `IFSC ${input.bankIfsc.trim()}` : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return input.bankDetails?.trim() || null;
}

async function assertUniqueVendorNameInDb(
  db: HairDb,
  name: string,
  excludeId?: string,
  ctx?: TenantContext | null,
) {
  ctx = await resolveTenantContextForService(ctx);
  const target = normalizeVendorName(name);
  const rows = await db
    .select({ id: fyhVendors.id, name: fyhVendors.name })
    .from(fyhVendors)
    .where(orgFilter(fyhVendors.organizationId, ctx));
  for (const row of rows) {
    if (excludeId && row.id === excludeId) continue;
    if (normalizeVendorName(row.name) === target) {
      throw new Error('A vendor with this name already exists');
    }
  }
}

function vendorValuesFromInput(input: VendorInput, ctx: TenantContext | null) {
  const name = input.name.trim();
  if (!name) throw new Error('Vendor name is required');
  const phone = input.phone?.trim() || null;
  return {
    ...tenantOrgDefaults(ctx),
    name,
    companyName: input.companyName?.trim() || null,
    contactName: input.contactName?.trim() || null,
    phone,
    email: input.email?.trim() || null,
    gstin: input.gstin?.trim() || null,
    address: input.address?.trim() || null,
    bankDetails: formatBankDetailsLegacy(input),
    bankAccountHolderName: input.bankAccountHolderName?.trim() || null,
    bankName: input.bankName?.trim() || null,
    bankAccountNumber: input.bankAccountNumber?.trim() || null,
    bankIfsc: input.bankIfsc?.trim() || null,
    upiId: input.upiId?.trim() || null,
    qrCodeUrl: input.qrCodeUrl?.trim() || null,
    notes: input.notes?.trim() || null,
    isActive: input.isActive !== false,
  };
}

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
  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as HairDb;
    await assertUniqueVendorNameInDb(db, input.name, undefined, ctx);
    const [row] = await tx.insert(fyhVendors).values(vendorValuesFromInput(input, ctx)).returning();
    if (!row) throw new Error('Failed to create vendor');
    if (input.brandNames?.length) {
      await syncVendorBrandsInDb(db, row.id, input.brandNames, ctx);
    }
    return row;
  });
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
      bankDetails: formatBankDetailsLegacy(input),
      bankAccountHolderName: input.bankAccountHolderName?.trim() || null,
      bankName: input.bankName?.trim() || null,
      bankAccountNumber: input.bankAccountNumber?.trim() || null,
      bankIfsc: input.bankIfsc?.trim() || null,
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

export function vendorInputFromFormValues(
  values: import('@/src/hair/lib/vendorConfigurationForm').VendorFormValues,
  qrCodeUrl?: string | null,
): VendorInput {
  return {
    name: values.name,
    contactName: values.contactName || null,
    phone: values.phone,
    email: values.email || null,
    address: values.address || null,
    brandNames: values.brandNames,
    bankAccountHolderName: values.bankAccountHolderName || null,
    bankName: values.bankName || null,
    bankAccountNumber: values.bankAccountNumber || null,
    bankIfsc: values.bankIfsc || null,
    upiId: values.upiId || null,
    qrCodeUrl: (qrCodeUrl ?? values.qrCodeStoredUrl) || null,
    isActive: values.isActive,
  };
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
