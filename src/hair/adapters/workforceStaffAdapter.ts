import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhStaff } from '@/src/hair/db/schema';
import { filterSelectablePosStaff } from '@/src/hair/lib/posStaffRoster';
import { formatStaffDisplayName } from '@/src/workforce/lib/staffDisplayName';
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
  Array<{
    id: string;
    fullName: string;
    phone: string | null;
    photoUrl: string | null;
    isActive: boolean;
    role: string | null;
  }>
> {
  const legacyRows = await hairDb
    .select({
      id: fyhStaff.id,
      fullName: fyhStaff.fullName,
      phone: fyhStaff.phone,
      photoUrl: fyhStaff.photoUrl,
      isActive: fyhStaff.isActive,
      role: fyhStaff.role,
    })
    .from(fyhStaff)
    .where(and(eq(fyhStaff.isActive, true), orgFilter(fyhStaff.organizationId, ctx)));
  const legacy = filterSelectablePosStaff(legacyRows);

  if (!isWorkforceEngineEnabled()) return legacy;

  const rows = await listEmployeesForEngine('fyh_salon', {
    activeOnly: true,
    receiveBookingsOnly: true,
    organizationId: ctx?.organizationId,
  });
  const workforce = filterSelectablePosStaff(
    rows.map((r) => ({
      id: r.employee.id,
      fullName: r.employee.fullName,
      phone: r.employee.mobile,
      photoUrl: r.employee.photoUrl ?? null,
      isActive: true,
      role: (r.membership?.jobRole ?? null) as string | null,
    })),
  );
  if (workforce.length === 0) return legacy;

  const byId = new Map<string, (typeof legacy)[number]>(
    workforce.map((row) => [row.id, row as (typeof legacy)[number]]),
  );
  for (const row of legacy) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return filterSelectablePosStaff([...byId.values()]);
}

/** Active team roster for Attendance owner views — all active staff, not bookable-only. */
export async function listTeamStaffForAttendance(
  ctx?: TenantContext | null,
): Promise<
  Array<{
    id: string;
    fullName: string;
    phone: string | null;
    photoUrl: string | null;
    isActive: boolean;
    role: string | null;
  }>
> {
  const mapName = (row: { id: string; fullName: string; phone: string | null; photoUrl: string | null; isActive: boolean; role: string | null }) => ({
    ...row,
    fullName: formatStaffDisplayName(row.fullName),
  });

  const legacyRows = await hairDb
    .select({
      id: fyhStaff.id,
      fullName: fyhStaff.fullName,
      phone: fyhStaff.phone,
      photoUrl: fyhStaff.photoUrl,
      isActive: fyhStaff.isActive,
      role: fyhStaff.role,
    })
    .from(fyhStaff)
    .where(and(eq(fyhStaff.isActive, true), orgFilter(fyhStaff.organizationId, ctx)));
  const legacy = legacyRows.map(mapName);

  if (!isWorkforceEngineEnabled()) return legacy;

  const rows = await listEmployeesForEngine('fyh_salon', {
    activeOnly: true,
    receiveBookingsOnly: false,
    organizationId: ctx?.organizationId,
  });
  const workforce = rows
    .map((r) => ({
      id: r.employee.id,
      fullName: r.employee.fullName,
      phone: r.employee.mobile,
      photoUrl: r.employee.photoUrl ?? null,
      isActive: true,
      role: (r.membership?.jobRole ?? null) as string | null,
    }))
    .map(mapName);
  if (workforce.length === 0) return legacy;

  const byId = new Map<string, (typeof legacy)[number]>(
    workforce.map((row) => [row.id, row as (typeof legacy)[number]]),
  );
  for (const row of legacy) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }),
  );
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
