import type { WorkforcePermissionKey } from '@/src/workforce/types';
import type { PlatformMembershipRole } from '@/src/platform/db/schema';

export type MembershipRole = PlatformMembershipRole;

/** Resolved once per server request / server action. */
export type TenantContext = {
  userId: string;
  organizationId: string;
  locationId: string;
  membershipId: string;
  membershipRole: MembershipRole;
  allowedLocationIds: string[];
  permissions: WorkforcePermissionKey[];
  employeeId?: string;
  legacyAdminId?: string;
};
