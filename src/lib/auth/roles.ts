import type { AdminUser } from '@/src/db/schema/adminUsers';

export type AdminRole = AdminUser['role'];

export type AdminPermission =
  | 'pgs:write'
  | 'bookings:write'
  | 'bookings:override_exit_lock'
  | 'extensions:write'
  | 'rent:write'
  | 'electricity:write'
  | 'deposits:write'
  | 'vacating:write'
  | 'payments:write'
  | 'payments:override'
  | 'kyc:write'
  /** View collections queues, calendar, reports */
  | 'collections:read'
  /** Approve/reject proofs, generate receipts, cash settle in collections */
  | 'collections:write'
  /** Send collection reminders (wa.me / delivery log) */
  | 'collections:remind'
  /** Waive late fees (Phase 3) */
  | 'collections:waive';

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  super_admin: new Set([
    'pgs:write',
    'bookings:write',
    'bookings:override_exit_lock',
    'extensions:write',
    'rent:write',
    'electricity:write',
    'deposits:write',
    'vacating:write',
    'payments:write',
    'payments:override',
    'kyc:write',
    'collections:read',
    'collections:write',
    'collections:remind',
    'collections:waive',
  ]),
  pg_manager: new Set([
    'pgs:write',
    'bookings:write',
    'extensions:write',
    'vacating:write',
    'kyc:write',
    'collections:read',
    'collections:remind',
  ]),
  accountant: new Set([
    'rent:write',
    'electricity:write',
    'deposits:write',
    'vacating:write',
    'payments:write',
    'collections:read',
    'collections:write',
    'collections:remind',
    'collections:waive',
  ]),
  receptionist: new Set([
    'payments:write',
    'collections:read',
    'collections:write',
  ]),
  viewer: new Set(['collections:read']),
};

export function adminHasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/** Only super_admin is unrestricted; all other roles require explicit PG membership. */
export function adminCanAccessPg(admin: Pick<AdminUser, 'role' | 'pgScope'>, pgId: string): boolean {
  if (admin.role === 'super_admin') return true;
  if (!admin.pgScope || admin.pgScope.length === 0) return false;
  return admin.pgScope.includes(pgId);
}
