import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhVendors } from '@/src/hair/db/schema';
import { detachBrandsFromVendor, syncVendorBrands } from '@/src/hair/services/brands';

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

export async function listVendors(opts?: { q?: string; status?: 'active' | 'inactive' | 'all' }) {
  const conditions = [];
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
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(fyhVendors.name))
    .limit(300);
}

export async function getVendor(id: string) {
  const [row] = await hairDb.select().from(fyhVendors).where(eq(fyhVendors.id, id)).limit(1);
  return row ?? null;
}

export async function createVendor(input: VendorInput) {
  const name = input.name.trim();
  if (!name) throw new Error('Vendor name is required');
  const [row] = await hairDb
    .insert(fyhVendors)
    .values({
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
    await syncVendorBrands(row.id, input.brandNames);
  }
  return row;
}

export async function updateVendor(id: string, input: VendorInput) {
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
    .where(eq(fyhVendors.id, id))
    .returning();
  if (!row) throw new Error('Vendor not found');
  if (input.brandNames) {
    await syncVendorBrands(id, input.brandNames);
  }
  return row;
}

export async function archiveVendor(id: string) {
  const [row] = await hairDb
    .update(fyhVendors)
    .set({ isActive: false })
    .where(eq(fyhVendors.id, id))
    .returning();
  if (!row) throw new Error('Vendor not found');
  await detachBrandsFromVendor(id);
  return row;
}
