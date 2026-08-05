import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhStaff } from '@/src/hair/db/schema';
import {
  listEmployeesForEngine,
  type EmployeeWithMembership,
} from '@/src/workforce/brains/employeeBrain';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

/** Bookable roster for appointments / POS — Workforce when enabled. */
export async function listBookableStaffForSalon(): Promise<
  Array<{ id: string; fullName: string; phone: string | null; isActive: boolean }>
> {
  if (isWorkforceEngineEnabled()) {
    const rows = await listEmployeesForEngine('fyh_salon', {
      activeOnly: true,
      receiveBookingsOnly: true,
    });
    return rows.map((r) => ({
      id: r.employee.id,
      fullName: r.employee.fullName,
      phone: r.employee.mobile,
      isActive: r.employee.status === 'active',
    }));
  }

  const rows = await hairDb
    .select({
      id: fyhStaff.id,
      fullName: fyhStaff.fullName,
      phone: fyhStaff.phone,
      isActive: fyhStaff.isActive,
    })
    .from(fyhStaff)
    .where(eq(fyhStaff.isActive, true));
  return rows;
}

export async function listActiveSalonStaffRoster(): Promise<EmployeeWithMembership[] | null> {
  if (!isWorkforceEngineEnabled()) return null;
  return listEmployeesForEngine('fyh_salon', { activeOnly: true });
}

export async function ensureStaffMirrorExists(employeeId: string): Promise<void> {
  if (!isWorkforceEngineEnabled()) return;
  const [row] = await hairDb.select({ id: fyhStaff.id }).from(fyhStaff).where(eq(fyhStaff.id, employeeId)).limit(1);
  if (row) return;
  // Appointments still FK to fyh_staff — mirror is created on employee write.
}
