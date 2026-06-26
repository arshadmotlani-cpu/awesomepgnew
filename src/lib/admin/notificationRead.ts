import { requireAdminSession } from '@/src/lib/auth/guards';
import { logger } from '@/src/lib/logger';
import { processNotificationReadParam } from '@/src/services/adminNotifications';

/** Marks a notification read when ?read= query param is present (server-side). */
export async function handleNotificationReadFromParams(
  loginPath: string,
  readParam: string | undefined,
) {
  if (!readParam?.trim()) return;
  const session = await requireAdminSession(loginPath);
  await processNotificationReadParam(session, readParam);
}

/**
 * Marks a single notification read when the admin arrived via an explicit deep link
 * (`?read=` legacy key or `?notifRead=` notification id). Never bulk-clears on page load.
 */
export async function ensureAdminPageNotificationsSeen(
  loginPath: string,
  _pathname: string,
  readParam?: string,
) {
  if (!readParam?.trim()) return;
  const session = await requireAdminSession(loginPath);
  logger.info('[notifications] deep-link read param on page load', {
    loginPath,
    readParam: readParam.slice(0, 80),
    adminId: session.adminId,
  });
  await processNotificationReadParam(session, readParam);
}
