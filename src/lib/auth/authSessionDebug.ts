import { env } from '@/src/lib/env';
import { logger } from '@/src/lib/logger';

export function authSessionDebug(event: string, payload: Record<string, unknown>): void {
  if (!env.AUTH_SESSION_DEBUG) return;
  logger.info(`auth_session_debug:${event}`, payload);
}
