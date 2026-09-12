/**
 * Staff/employee data access with field-level permission projection.
 */

import type { WfEmployee } from '@/src/workforce/db/schema';
import type { PermissionContext } from '@/src/workforce/permissions/permissionContext';
import { projectStaffFields, staffFieldMask } from '@/src/workforce/permissions/fieldProjection';

export function projectEmployeeForActor<T extends Record<string, unknown>>(
  permCtx: PermissionContext,
  employee: T,
  targetEmployeeId?: string,
): T {
  const isSelf =
    targetEmployeeId != null &&
    permCtx.session.workforceEmployeeId === targetEmployeeId;

  if (isSelf) {
    return employee;
  }

  const mask = staffFieldMask(permCtx.grants);
  return projectStaffFields(employee, mask);
}

export function projectEmployeesForActor(
  permCtx: PermissionContext,
  employees: WfEmployee[],
): WfEmployee[] {
  return employees.map((e) =>
    projectEmployeeForActor(permCtx, e, e.id) as WfEmployee,
  );
}
