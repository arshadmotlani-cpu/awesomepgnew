import type { NextRequest } from 'next/server';
import { logger } from '@/src/lib/logger';
import { createRequestId } from '@/src/lib/monitoring/requestContext';
import { maybeRunRecoveryCheck } from '@/src/lib/healing/healthEngine';

type RouteHandler = (req: NextRequest, ctx?: unknown) => Promise<Response>;

const DEGRADED_BODY = {
  success: false,
  degraded: true,
  message: 'Service temporarily unstable',
  fallback: true,
} as const;

export function withSelfHealing(handler: RouteHandler, routeLabel?: string): RouteHandler {
  return async (req: NextRequest, ctx?: unknown) => {
    await maybeRunRecoveryCheck();

    const startedAt = Date.now();
    const requestId = req.headers.get('x-request-id') ?? createRequestId();
    const route = routeLabel ?? req.nextUrl.pathname;
    const method = req.method;

    const execute = async () => handler(req, ctx);

    try {
      let response: Response;
      try {
        response = await execute();
      } catch (firstErr) {
        const message = firstErr instanceof Error ? firstErr.message : String(firstErr);
        logger.warn('api self-heal: retrying after failure', { route, requestId, message });
        response = await execute();
      }

      const latencyMs = Date.now() - startedAt;
      logger.api('self-healing request ok', {
        route,
        method,
        requestId,
        status: response.status,
        latencyMs,
      });

      return response;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      logger.error('api self-heal: degraded response', {
        route,
        method,
        requestId,
        latencyMs,
        message,
        stack,
      });

      return Response.json(DEGRADED_BODY, {
        status: 503,
        headers: { 'x-request-id': requestId, 'x-degraded': 'true' },
      });
    }
  };
}
