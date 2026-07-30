import { asc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhStaff, type FyhCommissionType } from '@/src/hair/db/schema';

export async function listStaff(includeInactive = false) {
  return hairDb
    .select()
    .from(fyhStaff)
    .where(includeInactive ? undefined : eq(fyhStaff.isActive, true))
    .orderBy(asc(fyhStaff.fullName));
}

export async function getStaffById(id: string) {
  const [row] = await hairDb.select().from(fyhStaff).where(eq(fyhStaff.id, id)).limit(1);
  return row ?? null;
}

export async function createStaffQuick(input: {
  fullName: string;
  phone?: string | null;
  role?: string | null;
}) {
  const fullName = input.fullName.trim();
  if (!fullName) throw new Error('Staff name is required');
  const [row] = await hairDb
    .insert(fyhStaff)
    .values({
      fullName,
      phone: input.phone?.trim() || null,
      role: input.role?.trim() || null,
      defaultCommissionType: 'none' as FyhCommissionType,
    })
    .returning();
  return row;
}
