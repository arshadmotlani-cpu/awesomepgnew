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
    case 'receptionist':
      return 'Receptionist';
    case 'stylist':
      return 'Stylist';
    case 'barber':
      return 'Barber';
    case 'beautician':
      return 'Beautician';
    case 'makeup_artist':
      return 'Makeup Artist';
    case 'nail_technician':
      return 'Nail Technician';
    case 'hair_assistant':
      return 'Hair Assistant';
    case 'cleaner':
      return 'Cleaner';
    case 'accountant':
      return 'Accountant';
    case 'inventory_manager':
      return 'Inventory Manager';
    case 'intern':
      return 'Intern';
    case 'housekeeping':
      return 'Housekeeping';
    case 'security':
      return 'Security';
    case 'driver':
      return 'Driver';
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
