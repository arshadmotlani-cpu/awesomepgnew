import type { PlatformMembershipRole } from '@/src/platform/db/schema';
import { normalizeAccessRole } from '@/src/workforce/accessRoles';

export type WorkforceBootstrapRoleInput = {
  rank?: string | null;
  jobRole?: string | null;
  isSystemProvider?: boolean;
  legacyAdminRole?: string | null;
};

/**
 * Map existing FYH workforce / legacy admin signals to Platform membership access_role.
 * Never uses email heuristics.
 */
export function resolvePlatformAccessRoleFromWorkforce(
  input: WorkforceBootstrapRoleInput,
): PlatformMembershipRole {
  if (input.isSystemProvider) return 'owner';

  const legacy = (input.legacyAdminRole ?? '').trim().toLowerCase();
  if (legacy === 'super_admin') return 'owner';

  const rank = (input.rank ?? '').trim().toLowerCase();
  const job = normalizeAccessRole(input.jobRole);

  if (rank === 'owner' || job === 'owner') return 'owner';
  if (job === 'manager' || rank === 'manager') return 'manager';
  if (job === 'biller') return 'biller';
  return 'staff';
}
