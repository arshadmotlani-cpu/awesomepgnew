import type { WorkforceJobRole, WorkforceRank } from '@/src/workforce/types';

/** Human labels — Owner / Manager / Staff (team_member). */
export function workforceRankLabel(rank: WorkforceRank): string {
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

export function workforceJobRoleLabel(jobRole: WorkforceJobRole): string {
  switch (jobRole) {
    case 'owner':
      return 'Owner';
    case 'manager':
      return 'Manager';
    case 'receptionist':
      return 'Receptionist';
    case 'stylist':
      return 'Stylist';
    case 'housekeeping':
      return 'Housekeeping';
    case 'security':
      return 'Security';
    case 'driver':
      return 'Driver';
    case 'cleaner':
      return 'Cleaner';
    case 'accountant':
      return 'Accountant';
    default:
      return jobRole;
  }
}

/** Designation shown in Add Employee UI (= job role). */
export function workforceDesignationLabel(jobRole: WorkforceJobRole): string {
  return workforceJobRoleLabel(jobRole);
}
