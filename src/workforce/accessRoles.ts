import type { WorkforceJobRole, WorkforceRank } from '@/src/workforce/types';
import { WORKFORCE_ACCESS_ROLES } from '@/src/workforce/types';

/** Derive legacy rank column from access role. */
export function rankFromAccessRole(accessRole: WorkforceJobRole): WorkforceRank {
  if (accessRole === 'owner') return 'owner';
  if (accessRole === 'manager') return 'manager';
  return 'team_member';
}

/** Map retired roles → one of the access roles (permissions + display). */
const LEGACY_ACCESS_ROLE_MAP: Record<string, WorkforceJobRole> = {
  accountant: 'biller',
  stylist: 'staff',
  barber: 'staff',
  beautician: 'staff',
  makeup_artist: 'staff',
  nail_technician: 'staff',
  hair_assistant: 'staff',
  cleaner: 'staff',
  inventory_manager: 'staff',
  intern: 'staff',
  housekeeping: 'staff',
  security: 'staff',
  driver: 'staff',
};

/** Normalize stored job_role for display and permission templates. */
export function normalizeAccessRole(role: string | null | undefined): WorkforceJobRole {
  const raw = (role ?? 'staff').trim().toLowerCase();
  if ((WORKFORCE_ACCESS_ROLES as readonly string[]).includes(raw)) {
    return raw as WorkforceJobRole;
  }
  return LEGACY_ACCESS_ROLE_MAP[raw] ?? 'staff';
}

export function isWorkforceAccessRole(value: string): value is WorkforceJobRole {
  const normalized = normalizeAccessRole(value);
  return (WORKFORCE_ACCESS_ROLES as readonly string[]).includes(normalized);
}
