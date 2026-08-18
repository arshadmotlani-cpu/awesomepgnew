import { and, asc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhStaff, type FyhCommissionType } from '@/src/hair/db/schema';
import { listBookableStaffForSalon } from '@/src/hair/adapters/workforceStaffAdapter';
import { normalizeMobile } from '@/src/workforce/auth/mobile';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import { createEmployee } from '@/src/workforce/services/employees';
import { listEmployeesForEngine } from '@/src/workforce/brains/employeeBrain';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

export async function listStaff(includeInactive = false, ctx?: TenantContext | null) {
  if (isWorkforceEngineEnabled()) {
    const rows = await listEmployeesForEngine('fyh_salon', {
      activeOnly: !includeInactive,
    });
    return rows.map((r) => ({
      id: r.employee.id,
      organizationId: r.employee.organizationId ?? null,
      fullName: r.employee.fullName,
      phone: r.employee.mobile,
      email: r.employee.email,
      photoUrl: r.employee.photoUrl,
      role: r.membership.jobRole,
      joiningDate: r.employee.joiningDate,
      performanceTargetPaise: r.membership.performanceTargetPaise,
      isActive: r.employee.status === 'active' && r.membership.isActive,
      defaultCommissionType: r.membership.defaultCommissionType as FyhCommissionType,
      defaultCommissionFixedPaise: r.membership.defaultCommissionFixedPaise,
      defaultCommissionPercentBps: r.membership.defaultCommissionPercentBps,
      createdAt: r.employee.createdAt,
      updatedAt: r.employee.updatedAt,
    }));
  }
  return hairDb
    .select()
    .from(fyhStaff)
    .where(
      and(
        orgFilter(fyhStaff.organizationId, ctx),
        includeInactive ? undefined : eq(fyhStaff.isActive, true),
      ),
    )
    .orderBy(asc(fyhStaff.fullName));
}

export async function listBookableStaff(ctx?: TenantContext | null) {
  return listBookableStaffForSalon();
}

export async function getStaffById(id: string, ctx?: TenantContext | null) {
  if (isWorkforceEngineEnabled()) {
    const rows = await listEmployeesForEngine('fyh_salon', { activeOnly: false });
    const hit = rows.find((r) => r.employee.id === id);
    if (!hit) return null;
    return {
      id: hit.employee.id,
      fullName: hit.employee.fullName,
      phone: hit.employee.mobile,
      email: hit.employee.email,
      photoUrl: hit.employee.photoUrl,
      role: hit.membership.jobRole,
      joiningDate: hit.employee.joiningDate,
      performanceTargetPaise: hit.membership.performanceTargetPaise,
      isActive: hit.employee.status === 'active',
      defaultCommissionType: hit.membership.defaultCommissionType as FyhCommissionType,
      defaultCommissionFixedPaise: hit.membership.defaultCommissionFixedPaise,
      defaultCommissionPercentBps: hit.membership.defaultCommissionPercentBps,
      createdAt: hit.employee.createdAt,
      updatedAt: hit.employee.updatedAt,
    };
  }
  const [row] = await hairDb
    .select()
    .from(fyhStaff)
    .where(and(orgFilter(fyhStaff.organizationId, ctx), eq(fyhStaff.id, id)))
    .limit(1);
  return row ?? null;
}

export async function createStaffQuick(
  input: {
    fullName: string;
    phone?: string | null;
    role?: string | null;
  },
  ctx?: TenantContext | null,
) {
  const fullName = input.fullName.trim();
  if (!fullName) throw new Error('Staff name is required');

  if (isWorkforceEngineEnabled()) {
    const raw = (input.role ?? '').toLowerCase();
    const accessRole = raw.includes('bill') || raw.includes('recept')
      ? 'biller'
      : raw.includes('manager')
        ? 'manager'
        : raw.includes('owner')
          ? 'owner'
          : 'staff';
    const mobile = input.phone ? normalizeMobile(input.phone) : null;
    const email = mobile
      ? `${mobile.replace(/\D/g, '')}@staff.fyh.local`
      : `staff-${crypto.randomUUID()}@staff.fyh.local`;
    const emp = await createEmployee({
      fullName,
      email,
      mobile: input.phone,
      accessRole,
      canLogin: false,
    });
    return {
      id: emp.id,
      fullName: emp.fullName,
      phone: emp.mobile,
      email: emp.email,
      photoUrl: emp.photoUrl,
      role: accessRole,
      joiningDate: emp.joiningDate,
      performanceTargetPaise: 0,
      isActive: true,
      defaultCommissionType: 'none' as FyhCommissionType,
      defaultCommissionFixedPaise: 0,
      defaultCommissionPercentBps: 0,
      createdAt: emp.createdAt,
      updatedAt: emp.updatedAt,
    };
  }

  const [row] = await hairDb
    .insert(fyhStaff)
    .values({
      ...tenantOrgDefaults(ctx),
      fullName,
      phone: input.phone?.trim() || null,
      role: input.role?.trim() || null,
      defaultCommissionType: 'none' as FyhCommissionType,
    })
    .returning();
  return row;
}
