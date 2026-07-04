/** Stable cache key for admin session scope within one RSC request. */
import type { AdminSession } from '@/src/lib/auth/session';

export function adminRequestScopeKey(session: AdminSession): string {
  const scope = [...(session.pgScope ?? [])].sort().join(',');
  return `${session.adminId}|${session.role}|${scope}`;
}
