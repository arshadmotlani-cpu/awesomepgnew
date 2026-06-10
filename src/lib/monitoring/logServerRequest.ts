import { headers } from 'next/headers';
import { logger } from '@/src/lib/logger';
import {
  contextFromHeaders,
  runWithMonitoringContext,
} from '@/src/lib/monitoring/requestContext';

/** Log a server-rendered page/API-RSC request (Node runtime only). */
export async function logServerRequest(route: string, userId?: string): Promise<void> {
  try {
    const h = await headers();
    const ctx = contextFromHeaders(h);
    if (userId) ctx.userId = userId;
    ctx.route = route;

    runWithMonitoringContext(ctx, () => {
      logger.api('server request', {
        route,
        method: ctx.method ?? 'GET',
        requestId: ctx.requestId,
        userId,
      });
    });
  } catch {
    // Headers unavailable or logging failed — never throw.
  }
}
