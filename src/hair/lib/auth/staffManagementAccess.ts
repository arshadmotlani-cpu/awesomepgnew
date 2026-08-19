import { redirect } from 'next/navigation';
import { getEmployeeDashboard } from '@/src/workforce/brains/employeeBrain';
import { hasWorkforcePermission } from '@/src/workforce/permissions/presets';
import type { WorkforcePermissionGrants } from '@/src/workforce/types';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireHairAuthPage } from '@/src/hair/lib/auth/guards';
import { isWorkforceMembershipAuthEnabled } from '@/src/hair/lib/tenant/flags';

export type StaffManagementAccess = {
  canView: true;
  canAdd: boolean;
  grants: WorkforcePermissionGrants | null;
};

/** True when the viewer may edit employee profiles (super_admin or staff.edit). */
export function canEditStaffProfiles(access: StaffManagementAccess): boolean {
  if (access.grants === null) return true;
  return hasWorkforcePermission(access.grants, 'staff.edit');
}

/**
 * Staff Management is available to Workforce users with staff.view or legacy super_admin.
 * Avoids redirecting ecosystem admins to /login → /dashboard/revenue.
 */
export async function requireStaffManagementAccess(): Promise<StaffManagementAccess> {
  const admin = await requireHairAuthPage();
  const session = await getHairSession();

  if (admin.role === 'super_admin') {
    return { canView: true, canAdd: true, grants: null };
  }

  if (!session?.workforceEmployeeId) {
    redirect('/appointments');
  }

  if (isWorkforceMembershipAuthEnabled()) {
    const grants: WorkforcePermissionGrants = {
      permissions: Array.isArray(session.admin.permissions) ? session.admin.permissions : [],
      maxBackdateDays: null,
    };
    if (!hasWorkforcePermission(grants, 'staff.view')) {
      redirect('/me');
    }
    return {
      canView: true,
      canAdd: hasWorkforcePermission(grants, 'staff.add'),
      grants,
    };
  }

  const dash = await getEmployeeDashboard(session.workforceEmployeeId, 'fyh_salon');
  const grants = dash?.grants ?? null;

  if (!hasWorkforcePermission(grants, 'staff.view')) {
    redirect('/me');
  }

  return {
    canView: true,
    canAdd: hasWorkforcePermission(grants, 'staff.add'),
    grants,
  };
}
