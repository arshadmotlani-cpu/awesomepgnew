import type { NextRequest } from 'next/server';
import { logger } from '@/src/lib/logger';
import { createRequestId } from '@/src/lib/monitoring/requestContext';

type RouteHandler = (req: NextRequest, ctx?: unknown) => Promise<Response>;

export function withErrorHandler(handler: RouteHandler, routeLabel?: string): RouteHandler {
  return async (req: NextRequest, ctx?: unknown) => {
    const startedAt = Date.now();
    const requestId = req.headers.get('x-request-id') ?? createRequestId();
    const route = routeLabel ?? req.nextUrl.pathname;
    const method = req.method;

    try {
      const response = await handler(req, ctx);
      const latencyMs = Date.now() - startedAt;

      logger.api('request completed', {
        route,
        method,
        requestId,
        status: response.status,
        latencyMs,
        slow: latencyMs > 500,
      });

      if (latencyMs > 500) {
        logger.warn('slow request', { route, method, requestId, latencyMs });
      }

      return response;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      logger.error('request failed', {
        route,
        method,
        requestId,
        latencyMs,
        message,
        stack,
      });

      return Response.json(
        { ok: false, error: { code: 'internal_error', message: 'Internal server error' } },
        { status: 500, headers: { 'x-request-id': requestId } },
      );
    }
  };
}
