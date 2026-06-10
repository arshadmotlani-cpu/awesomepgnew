import { enqueueLog } from '@/src/lib/monitoring/logStore';
import { getMonitoringContext } from '@/src/lib/monitoring/requestContext';
import { sanitizeMeta } from '@/src/lib/monitoring/sanitize';

export type LogLevel = 'info' | 'warn' | 'error' | 'db' | 'api';

type LogMeta = Record<string, unknown>;

function environment(): 'production' | 'development' | 'test' {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'test') return 'test';
  return 'development';
}

function write(
  level: LogLevel,
  message: string,
  meta: LogMeta = {},
  overrides?: { route?: string; method?: string; userId?: string; requestId?: string },
): void {
  const ctx = getMonitoringContext();
  const payload = sanitizeMeta({
    timestamp: new Date().toISOString(),
    environment: environment(),
    ...meta,
  }) as LogMeta;

  const route = overrides?.route ?? ctx?.route ?? (meta.route as string | undefined);
  const method = overrides?.method ?? ctx?.method ?? (meta.method as string | undefined);
  const userId = overrides?.userId ?? ctx?.userId ?? (meta.userId as string | undefined);
  const requestId =
    overrides?.requestId ?? ctx?.requestId ?? (meta.requestId as string | undefined);

  const line = {
    level,
    message,
    route,
    method,
    userId,
    requestId,
    meta: payload,
  };

  if (level === 'error') {
    console.error(`[${level}]`, line);
  } else if (level === 'warn') {
    console.warn(`[${level}]`, line);
  } else {
    console.log(`[${level}]`, line);
  }

  try {
    enqueueLog({
      level,
      message,
      route: route ?? null,
      method: method ?? null,
      userId: userId ?? null,
      requestId: requestId ?? null,
      meta: payload,
    });
  } catch {
    // Never block the request path if logging fails.
  }
}

export const logger = {
  info(message: string, meta?: LogMeta) {
    write('info', message, meta);
  },
  warn(message: string, meta?: LogMeta) {
    write('warn', message, meta);
  },
  error(message: string, meta?: LogMeta) {
    write('error', message, meta);
  },
  db(message: string, meta?: LogMeta) {
    write('db', message, meta);
  },
  api(message: string, meta?: LogMeta) {
    write('api', message, meta);
  },
};
