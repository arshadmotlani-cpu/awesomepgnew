import { AsyncLocalStorage } from 'node:async_hooks';

export type MonitoringRequestContext = {
  requestId: string;
  route?: string;
  method?: string;
  userId?: string;
  startedAt: number;
};

const storage = new AsyncLocalStorage<MonitoringRequestContext>();

export function getMonitoringContext(): MonitoringRequestContext | undefined {
  return storage.getStore();
}

export function runWithMonitoringContext<T>(
  context: MonitoringRequestContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

export async function runWithMonitoringContextAsync<T>(
  context: MonitoringRequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(context, fn);
}

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function contextFromHeaders(headers: Headers): MonitoringRequestContext {
  const requestId = headers.get('x-request-id') ?? createRequestId();
  const startedAt = Number.parseInt(headers.get('x-request-start') ?? '', 10);
  return {
    requestId,
    route: headers.get('x-request-route') ?? undefined,
    method: headers.get('x-request-method') ?? undefined,
    userId: headers.get('x-user-id') ?? undefined,
    startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
  };
}
