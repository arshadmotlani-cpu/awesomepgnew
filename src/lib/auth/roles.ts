import type { AdminUser } from '@/src/db/schema/adminUsers';

export type AdminRole = AdminUser['role'];

export type AdminPermission =
  | 'pgs:write'
  | 'bookings:write'
  | 'extensions:write'
  | 'rent:write'
  | 'electricity:write'
  | 'deposits:write'
  | 'vacating:write'
  | 'payments:write'
  | 'kyc:write';

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  super_admin: new Set([
    'pgs:write',
    'bookings:write',
    'extensions:write',
    'rent:write',
    'electricity:write',
    'deposits:write',
    'vacating:write',
    'payments:write',
    'kyc:write',
  ]),
  pg_manager: new Set([
    'pgs:write',
    'bookings:write',
    'extensions:write',
    'vacating:write',
    'kyc:write',
  ]),
  accountant: new Set([
    'rent:write',
    'electricity:write',
    'deposits:write',
    'vacating:write',
    'payments:write',
  ]),
  viewer: new Set(),
};

export function adminHasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Empty pgScope means unrestricted (super_admin convention). */
export function adminCanAccessPg(admin: Pick<AdminUser, 'role' | 'pgScope'>, pgId: string): boolean {
  if (admin.role === 'super_admin') return true;
  if (!admin.pgScope || admin.pgScope.length === 0) return true;
  return admin.pgScope.includes(pgId);
}
