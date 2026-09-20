export const DEPLOY_CHUNK_RELOAD_KEY = 'apg:deploy-chunk-reload';

/** @deprecated Legacy key — v2 uses DEPLOY_RECOVERY_STATE_KEY */
export const DEPLOY_RECOVERY_STATE_KEY = 'apg:deploy-recovery-v2';

export const DEPLOY_RECOVERY_MAX_ATTEMPTS = 3;
export const DEPLOY_RECOVERY_MIN_INTERVAL_MS = 1_500;
export const RECOVERY_QUERY_PARAM = '__apg_recover';
export const RECOVERY_DEPLOY_PARAM = '__apg_d';
export const LIVE_DEPLOY_META_NAME = 'apg-deploy-id';

const CHUNK_FAILURE_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Failed to fetch RSC payload/i,
  /RSC payload.*(failed|error)/i,
];

const HTML_AS_JS_PATTERN = /Unexpected token '<'/i;
const NEXT_CHUNK_PATH = /\/_next\//;

export type DeployRecoveryState = {
  v: 1;
  deployId: string;
  attempts: number;
  lastAt: number;
};

export function normalizeDeployId(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Deploy id baked into the client bundle at build time. */
export function getBundledDeployId(): string {
  const fromEnv =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_DEPLOY_ID : undefined;
  return normalizeDeployId(fromEnv) ?? 'development';
}

/** @deprecated Use getBundledDeployId */
export function getDeployReloadMarker(): string {
  return getBundledDeployId();
}

function failureMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === 'string') return error;
  return String(error ?? '');
}

function isHtmlReturnedAsModule(message: string, source?: string | null): boolean {
  if (!HTML_AS_JS_PATTERN.test(message)) return false;
  if (!source) return true;
  return NEXT_CHUNK_PATH.test(source) || /\.js(?:\?|$)/i.test(source);
}

/** True only for stale deploy / missing chunk / HTML-as-JS module failures. */
export function isDeployChunkFailure(
  error: unknown,
  context?: { source?: string | null },
): boolean {
  const message = failureMessage(error);
  if (CHUNK_FAILURE_PATTERNS.some((pattern) => pattern.test(message))) {
    return true;
  }
  return isHtmlReturnedAsModule(message, context?.source);
}

export function extractLiveDeployIdFromHtml(html: string): string | null {
  const re = new RegExp(
    `<meta\\s+name=["']${LIVE_DEPLOY_META_NAME}["']\\s+content=["']([^"']*)["']`,
    'i',
  );
  const match = html.match(re);
  if (!match?.[1]) return null;
  return normalizeDeployId(match[1]);
}

export function parseDeployRecoveryState(raw: string | null): DeployRecoveryState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DeployRecoveryState>;
    if (parsed.v !== 1) return null;
    const deployId = normalizeDeployId(parsed.deployId);
    if (!deployId) return null;
    const attempts = Number(parsed.attempts);
    const lastAt = Number(parsed.lastAt);
    if (!Number.isFinite(attempts) || attempts < 0) return null;
    if (!Number.isFinite(lastAt) || lastAt < 0) return null;
    return { v: 1, deployId, attempts, lastAt };
  } catch {
    return null;
  }
}

export function serializeDeployRecoveryState(state: DeployRecoveryState): string {
  return JSON.stringify(state);
}

export type DeployRecoveryPlan =
  | { proceed: true; attempt: number; url: string; deployId: string }
  | { proceed: false; reason: string };

/** Pure planning step — safe to unit test without a browser. */
export function planDeployChunkRecovery(input: {
  href: string;
  bundledDeployId: string;
  storedState: DeployRecoveryState | null;
  nowMs: number;
}): DeployRecoveryPlan {
  const deployId = normalizeDeployId(input.bundledDeployId) ?? 'development';
  if (!normalizeDeployId(deployId)) {
    return { proceed: false, reason: 'invalid_deploy_id' };
  }

  let state = input.storedState;
  if (!state || state.deployId !== deployId) {
    state = { v: 1, deployId, attempts: 0, lastAt: 0 };
  }

  if (state.attempts >= DEPLOY_RECOVERY_MAX_ATTEMPTS) {
    return { proceed: false, reason: 'max_attempts' };
  }

  if (state.lastAt > 0 && input.nowMs - state.lastAt < DEPLOY_RECOVERY_MIN_INTERVAL_MS) {
    return { proceed: false, reason: 'throttled' };
  }

  const attempt = state.attempts + 1;
  const url = buildRecoveryNavigationUrl(input.href, deployId, attempt);
  return { proceed: true, attempt, url, deployId };
}

export function nextDeployRecoveryState(
  previous: DeployRecoveryState | null,
  deployId: string,
  attempt: number,
  nowMs: number,
): DeployRecoveryState {
  const id = normalizeDeployId(deployId) ?? 'development';
  return {
    v: 1,
    deployId: id,
    attempts: attempt,
    lastAt: nowMs,
  };
}

/** Strip recovery query params; returns null if nothing to strip. */
export function stripDeployRecoveryParams(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has(RECOVERY_QUERY_PARAM) && !url.searchParams.has(RECOVERY_DEPLOY_PARAM)) {
    return null;
  }
  url.searchParams.delete(RECOVERY_QUERY_PARAM);
  url.searchParams.delete(RECOVERY_DEPLOY_PARAM);
  const qs = url.searchParams.toString();
  return qs ? `${url.pathname}?${qs}${url.hash}` : `${url.pathname}${url.hash}`;
}

/** Cache-busting navigation URL — preserves path, unrelated query, and hash. */
export function buildRecoveryNavigationUrl(href: string, deployId: string, attempt: number): string {
  const url = new URL(href);
  url.searchParams.delete(RECOVERY_QUERY_PARAM);
  url.searchParams.delete(RECOVERY_DEPLOY_PARAM);
  url.searchParams.set(RECOVERY_QUERY_PARAM, String(attempt));
  const id = normalizeDeployId(deployId) ?? 'development';
  url.searchParams.set(RECOVERY_DEPLOY_PARAM, id.length > 24 ? id.slice(0, 24) : id);
  return url.toString();
}

export function shouldRecoverAfterBfcache(bundledDeployId: string, liveDeployId: string | null): boolean {
  const bundled = normalizeDeployId(bundledDeployId) ?? 'development';
  const live = normalizeDeployId(liveDeployId);
  if (!live) return false;
  return live !== bundled;
}

export async function fetchLiveDeployIdFromDocument(
  fetchImpl: typeof fetch,
  location: Pick<Location, 'pathname' | 'search' | 'origin'>,
): Promise<string | null> {
  const target = `${location.pathname}${location.search}`;
  try {
    const res = await fetchImpl(target, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractLiveDeployIdFromHtml(html);
  } catch {
    return null;
  }
}

function readRecoveryStateFromSession(): DeployRecoveryState | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseDeployRecoveryState(sessionStorage.getItem(DEPLOY_RECOVERY_STATE_KEY));
  } catch {
    return null;
  }
}

function writeRecoveryStateToSession(state: DeployRecoveryState): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(DEPLOY_RECOVERY_STATE_KEY, serializeDeployRecoveryState(state));
  } catch {
    // sessionStorage unavailable — still navigate once.
  }
}

/** Bounded deploy/chunk recovery with cache-busting navigation (preserves cookies + route). */
export function scheduleDeployChunkRecovery(): boolean {
  if (typeof window === 'undefined') return false;

  const plan = planDeployChunkRecovery({
    href: window.location.href,
    bundledDeployId: getBundledDeployId(),
    storedState: readRecoveryStateFromSession(),
    nowMs: Date.now(),
  });

  if (!plan.proceed) return false;

  writeRecoveryStateToSession(
    nextDeployRecoveryState(readRecoveryStateFromSession(), plan.deployId, plan.attempt, Date.now()),
  );

  // Legacy marker — prevents older one-shot logic from fighting v2.
  try {
    sessionStorage.setItem(DEPLOY_CHUNK_RELOAD_KEY, plan.deployId);
  } catch {
    /* ignore */
  }

  window.location.replace(plan.url);
  return true;
}

/** @deprecated Alias for scheduleDeployChunkRecovery */
export function scheduleDeployChunkReload(): boolean {
  return scheduleDeployChunkRecovery();
}

export function cleanDeployRecoveryParamsFromLocation(): void {
  if (typeof window === 'undefined') return;
  const cleaned = stripDeployRecoveryParams(window.location.href);
  if (!cleaned) return;
  const next = new URL(cleaned, window.location.origin);
  window.history.replaceState(window.history.state, '', `${next.pathname}${next.search}${next.hash}`);
}
