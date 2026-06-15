import { requireAdminSession } from '@/src/lib/auth/guards';
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
