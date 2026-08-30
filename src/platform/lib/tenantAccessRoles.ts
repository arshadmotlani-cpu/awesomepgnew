import { PLATFORM_MEMBERSHIP_ROLES, type PlatformMembershipRole } from '@/src/platform/db/schema';

/** Tenant access roles assignable from SaaS Admin (SSOT for member/invite UI). */
export const PLATFORM_TENANT_ACCESS_ROLES = PLATFORM_MEMBERSHIP_ROLES;

export const PLATFORM_TENANT_ROLE_LABELS: Record<PlatformMembershipRole, string> = {
  owner: 'Owner',
  co_owner: 'Co-owner',
  manager: 'Manager',
  receptionist: 'Receptionist',
  biller: 'Biller',
  staff: 'Staff',
};

export function platformTenantRoleLabel(role: PlatformMembershipRole | string): string {
  const key = role as PlatformMembershipRole;
  return PLATFORM_TENANT_ROLE_LABELS[key] ?? String(role).replace('_', ' ');
}

export function isPlatformTenantAccessRole(value: string): value is PlatformMembershipRole {
  return (PLATFORM_TENANT_ACCESS_ROLES as readonly string[]).includes(value);
}
