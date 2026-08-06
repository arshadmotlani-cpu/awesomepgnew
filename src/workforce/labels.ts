import type { WorkforceJobRole } from '@/src/workforce/types';
import { normalizeAccessRole } from '@/src/workforce/accessRoles';

/** Human labels — legacy rank column (Owner / Manager / Staff). */
export function workforceRankLabel(rank: import('@/src/workforce/types').WorkforceRank): string {
  switch (rank) {
    case 'owner':
      return 'Owner';
    case 'manager':
      return 'Manager';
    case 'team_member':
      return 'Staff';
    default:
      return rank;
  }
}

export function workforceAccessRoleLabel(accessRole: WorkforceJobRole | string): string {
  const role = normalizeAccessRole(accessRole);
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'manager':
      return 'Manager';
    case 'biller':
      return 'Biller';
    case 'staff':
      return 'Staff';
    default:
      return String(accessRole);
  }
}

/** @deprecated Use workforceAccessRoleLabel */
export function workforceJobRoleLabel(jobRole: WorkforceJobRole): string {
  return workforceAccessRoleLabel(jobRole);
}

/** @deprecated Use workforceAccessRoleLabel */
export function workforceDesignationLabel(jobRole: WorkforceJobRole): string {
  return workforceAccessRoleLabel(jobRole);
}
