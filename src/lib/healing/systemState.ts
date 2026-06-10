export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
export type DbStatus = 'ok' | 'degraded' | 'down';
export type EnvStatus = 'ok' | 'degraded';

export type RetryRecord = {
  at: string;
  action: string;
  ok: boolean;
  detail?: string;
};

export type SystemHealState = {
  status: HealthStatus;
  dbStatus: DbStatus;
  envStatus: EnvStatus;
  degradedMode: boolean;
  dbDegradedMode: boolean;
  safeMode: boolean;
  lastError: string | null;
  lastRecoveredAt: string | null;
  consecutiveFailures: number;
  retryHistory: RetryRecord[];
  updatedAt: string;
};

const GLOBAL_KEY = '__awesomepgHealState' as const;
const MAX_RETRY_HISTORY = 50;

function defaultState(): SystemHealState {
  return {
    status: 'HEALTHY',
    dbStatus: 'ok',
    envStatus: 'ok',
    degradedMode: false,
    dbDegradedMode: false,
    safeMode: false,
    lastError: null,
    lastRecoveredAt: null,
    consecutiveFailures: 0,
    retryHistory: [],
    updatedAt: new Date().toISOString(),
  };
}

function healGlobal(): { state: SystemHealState } {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: { state: SystemHealState };
  };
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { state: defaultState() };
  return g[GLOBAL_KEY];
}

export function getSystemState(): SystemHealState {
  return { ...healGlobal().state, retryHistory: [...healGlobal().state.retryHistory] };
}

export function patchSystemState(patch: Partial<SystemHealState>): SystemHealState {
  const global = healGlobal();
  global.state = {
    ...global.state,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  return getSystemState();
}

export function recordRetry(action: string, ok: boolean, detail?: string): void {
  const global = healGlobal();
  global.state.retryHistory.unshift({
    at: new Date().toISOString(),
    action,
    ok,
    detail,
  });
  if (global.state.retryHistory.length > MAX_RETRY_HISTORY) {
    global.state.retryHistory.length = MAX_RETRY_HISTORY;
  }
  global.state.updatedAt = new Date().toISOString();
}

export function isSafeMode(): boolean {
  return healGlobal().state.safeMode;
}

export function isDbDegraded(): boolean {
  return healGlobal().state.dbDegradedMode;
}

export function isDegradedMode(): boolean {
  return healGlobal().state.degradedMode;
}
