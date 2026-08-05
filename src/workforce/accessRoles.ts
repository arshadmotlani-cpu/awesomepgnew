import type { WorkforceJobRole, WorkforceRank } from '@/src/workforce/types';
import { WORKFORCE_ACCESS_ROLES } from '@/src/workforce/types';

/** Derive legacy rank column from access role (permissions SSOT is job_role). */
export function rankFromAccessRole(accessRole: WorkforceJobRole): WorkforceRank {
  if (accessRole === 'owner') return 'owner';
  if (accessRole === 'manager') return 'manager';
  return 'team_member';
}

const LEGACY_ACCESS_ROLE_MAP: Record<string, WorkforceJobRole> = {
  housekeeping: 'cleaner',
  security: 'cleaner',
  driver: 'intern',
};

/** Normalize stored job_role / access role for display and permission presets. */
export function normalizeAccessRole(role: string | null | undefined): WorkforceJobRole {
  const raw = (role ?? 'stylist').trim().toLowerCase() as WorkforceJobRole;
  if ((WORKFORCE_ACCESS_ROLES as readonly string[]).includes(raw)) return raw;
  return LEGACY_ACCESS_ROLE_MAP[raw] ?? raw;
}

export function isWorkforceAccessRole(value: string): value is WorkforceJobRole {
  return (WORKFORCE_ACCESS_ROLES as readonly string[]).includes(value);
}
