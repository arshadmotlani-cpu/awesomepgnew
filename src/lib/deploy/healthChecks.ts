import { testDatabaseConnection } from '@/src/lib/db/db-safe';
import { getWatchdogBaseUrl } from '@/src/lib/deploy/config';

export type RouteCheckResult = {
  route: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  error?: string;
  critical: boolean;
};

export type HealthCheckReport = {
  ok: boolean;
  baseUrl: string;
  checks: RouteCheckResult[];
  dbOk: boolean;
  dbError?: string;
  failureRate: number;
  slowCount: number;
  summary: string;
  checkedAt: string;
};

const RESPONSE_TIME_FAIL_MS = 5_000;
const RESPONSE_TIME_WARN_MS = 2_000;

async function checkRoute(
  baseUrl: string,
  route: string,
  critical: boolean,
  expectJson = false,
): Promise<RouteCheckResult> {
  const url = `${baseUrl}${route}`;
  const started = Date.now();

  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'x-deploy-watchdog': '1' },
      signal: AbortSignal.timeout(RESPONSE_TIME_FAIL_MS + 1_000),
    });
    const latencyMs = Date.now() - started;
    const text = await res.text();

    let ok = res.status < 500 && res.status !== 0;
    let error: string | undefined;

    if (res.status >= 500) {
      ok = false;
      error = `HTTP ${res.status}`;
    } else if (!expectJson && text.trim().length < 80) {
      ok = false;
      error = 'blank or truncated HTML response';
    }

    if (expectJson) {
      try {
        const json = JSON.parse(text) as { ok?: boolean; healing?: { status?: string } };
        if (route === '/api/health' && json.ok !== true) {
          ok = false;
          error = 'health JSON ok !== true';
        }
      } catch {
        ok = false;
        error = 'invalid JSON';
      }
    }

    if (latencyMs > RESPONSE_TIME_FAIL_MS) {
      ok = false;
      error = error ?? `slow response ${latencyMs}ms`;
    }

    return { route, ok, status: res.status, latencyMs, error, critical };
  } catch (err) {
    return {
      route,
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      critical,
    };
  }
}

function shouldConfirmFailure(checks: RouteCheckResult[], dbOk: boolean): boolean {
  const criticalFails = checks.filter((c) => c.critical && !c.ok);
  if (criticalFails.length > 0) return true;
  if (!dbOk) return true;

  const failCount = checks.filter((c) => !c.ok).length;
  const fiveHundreds = checks.filter((c) => c.status >= 500).length;
  if (fiveHundreds >= 2) return true;
  if (failCount >= 2) return true;

  const failureRate = checks.length ? failCount / checks.length : 0;
  if (failureRate > 0.1) return true;

  const slowCount = checks.filter((c) => c.latencyMs > RESPONSE_TIME_FAIL_MS).length;
  if (slowCount >= 2) return true;

  return false;
}

export async function runHealthChecks(baseUrl?: string): Promise<HealthCheckReport> {
  const resolvedBase = (baseUrl ?? getWatchdogBaseUrl()).replace(/\/$/, '');

  const [home, pgs, health] = await Promise.all([
    checkRoute(resolvedBase, '/', true, false),
    checkRoute(resolvedBase, '/pgs', true, false),
    checkRoute(resolvedBase, '/api/health', true, true),
  ]);

  const checks = [home, pgs, health];
  const db = await testDatabaseConnection();

  const failCount = checks.filter((c) => !c.ok).length + (db.ok ? 0 : 1);
  const total = checks.length + 1;
  const failureRate = total ? failCount / total : 0;
  const slowCount = checks.filter((c) => c.latencyMs > RESPONSE_TIME_WARN_MS).length;

  const ok = !shouldConfirmFailure(checks, db.ok);
  const failed = [
    ...checks.filter((c) => !c.ok).map((c) => `${c.route}: ${c.error ?? c.status}`),
    ...(!db.ok ? [`db: ${db.error ?? 'down'}`] : []),
  ];

  return {
    ok,
    baseUrl: resolvedBase,
    checks,
    dbOk: db.ok,
    dbError: db.error,
    failureRate,
    slowCount,
    summary: ok ? 'All health checks passed' : failed.join('; '),
    checkedAt: new Date().toISOString(),
  };
}
