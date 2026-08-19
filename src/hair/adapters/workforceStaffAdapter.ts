import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhStaff } from '@/src/hair/db/schema';
import { orgFilter } from '@/src/hair/lib/tenant/filters';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import {
  listEmployeesForEngine,
  type EmployeeWithMembership,
} from '@/src/workforce/brains/employeeBrain';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

/** Bookable roster for appointments / POS — Workforce when enabled. */
export async function listBookableStaffForSalon(
  ctx?: TenantContext | null,
): Promise<
  Array<{ id: string; fullName: string; phone: string | null; photoUrl: string | null; isActive: boolean }>
> {
  if (isWorkforceEngineEnabled()) {
    const rows = await listEmployeesForEngine('fyh_salon', {
      activeOnly: true,
      receiveBookingsOnly: true,
    });
    const scoped =
      ctx?.organizationId
        ? rows.filter((r) => r.employee.organizationId === ctx.organizationId)
        : rows;
    return scoped.map((r) => ({
      id: r.employee.id,
      fullName: r.employee.fullName,
      phone: r.employee.mobile,
      photoUrl: r.employee.photoUrl ?? null,
      isActive: true,
    }));
  }

  const rows = await hairDb
    .select({
      id: fyhStaff.id,
      fullName: fyhStaff.fullName,
      phone: fyhStaff.phone,
      photoUrl: fyhStaff.photoUrl,
      isActive: fyhStaff.isActive,
    })
    .from(fyhStaff)
    .where(and(eq(fyhStaff.isActive, true), orgFilter(fyhStaff.organizationId, ctx)));
  return rows;
}

export async function listActiveSalonStaffRoster(): Promise<EmployeeWithMembership[] | null> {
  if (!isWorkforceEngineEnabled()) return null;
  return listEmployeesForEngine('fyh_salon', { activeOnly: true });
}

export async function ensureStaffMirrorExists(employeeId: string): Promise<void> {
  if (!isWorkforceEngineEnabled()) return;
  const [row] = await hairDb
    .select({ id: fyhStaff.id })
    .from(fyhStaff)
    .where(eq(fyhStaff.id, employeeId))
    .limit(1);
  if (row) return;
  // Appointments still FK to fyh_staff — mirror is created on employee write.
}
