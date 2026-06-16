import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  markNotificationsSeenForPath,
  processNotificationReadParam,
} from '@/src/services/adminNotifications';

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
 * Marks module notifications SEEN when admin opens the relevant page.
 * Also handles optional ?read= deep-link for a single notification.
 */
export async function ensureAdminPageNotificationsSeen(
  loginPath: string,
  pathname: string,
  readParam?: string,
) {
  const session = await requireAdminSession(loginPath);
  if (readParam?.trim()) {
    await processNotificationReadParam(session, readParam);
  }
  await markNotificationsSeenForPath(session, pathname);
}
