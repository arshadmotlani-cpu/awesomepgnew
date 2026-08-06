/**
 * Workforce Engine — domain constants (no salon naming).
 */

export const WORKFORCE_ENGINES = [
  'fyh_salon',
  'awesome_pg',
  'automotive_capital',
  'personal_finance',
] as const;
export type WorkforceEngineId = (typeof WORKFORCE_ENGINES)[number];

export const WORKFORCE_RANKS = ['owner', 'manager', 'team_member'] as const;
export type WorkforceRank = (typeof WORKFORCE_RANKS)[number];

/** ERP job title — stored in wf_engine_memberships.job_role. Does NOT grant access by itself. */
export const WORKFORCE_ACCESS_ROLES = [
  'owner',
  'manager',
  'receptionist',
  'stylist',
  'barber',
  'beautician',
  'makeup_artist',
  'nail_technician',
  'hair_assistant',
  'cleaner',
  'accountant',
  'inventory_manager',
  'intern',
] as const;
export type WorkforceAccessRole = (typeof WORKFORCE_ACCESS_ROLES)[number];

/** Legacy job_role values still present in migrated rows. */
export const WORKFORCE_LEGACY_ACCESS_ROLES = ['housekeeping', 'security', 'driver'] as const;

export const WORKFORCE_JOB_ROLES = [
  ...WORKFORCE_ACCESS_ROLES,
  ...WORKFORCE_LEGACY_ACCESS_ROLES,
] as const;
export type WorkforceJobRole = (typeof WORKFORCE_JOB_ROLES)[number];

export const WORKFORCE_EMPLOYEE_STATUSES = ['active', 'inactive'] as const;
export type WorkforceEmployeeStatus = (typeof WORKFORCE_EMPLOYEE_STATUSES)[number];

export const WORKFORCE_GENDERS = ['male', 'female', 'other', 'unspecified'] as const;
export type WorkforceGender = (typeof WORKFORCE_GENDERS)[number];

import type {
  WorkforcePermissionKey,
  WorkforcePermissionGroup,
  WorkforcePermissionDef,
} from '@/src/workforce/permissions/library';

export type { WorkforcePermissionKey, WorkforcePermissionGroup, WorkforcePermissionDef };
export {
  WORKFORCE_PERMISSION_KEYS,
  WORKFORCE_PERMISSION_LIBRARY,
  WORKFORCE_PERMISSION_GROUP_LABELS,
  isWorkforcePermissionKey,
  permissionDef,
  permissionsByGroup,
} from '@/src/workforce/permissions/library';

export type WorkforcePermissionGrants = {
  permissions: WorkforcePermissionKey[];
  /** null = unlimited (Owner) */
  maxBackdateDays: number | null;
};

export const RANK_ORDER: Record<WorkforceRank, number> = {
  owner: 100,
  manager: 50,
  team_member: 10,
};

/**
 * Workforce is ON by default so FYH surfaces the permanent employee system.
 * Opt out explicitly: WORKFORCE_ENGINE=0 | false | off
 */
export function isWorkforceEngineEnabled(): boolean {
  const raw = process.env.WORKFORCE_ENGINE;
  if (raw === undefined || raw.trim() === '') return true;
  const v = raw.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return v === '1' || v === 'true' || v === 'on';
}
