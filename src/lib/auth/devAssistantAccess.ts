import type { AdminRole } from '@/src/lib/auth/roles';

/** Internal dev assistant — super admin and PG managers only. */
export function canAccessDevAssistant(role: AdminRole): boolean {
  return role === 'super_admin' || role === 'pg_manager';
}
