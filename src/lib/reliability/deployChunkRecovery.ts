export const DEPLOY_CHUNK_RELOAD_KEY = 'apg:deploy-chunk-reload';

const CHUNK_FAILURE_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
];

export function isDeployChunkFailure(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : String(error ?? '');
  return CHUNK_FAILURE_PATTERNS.some((pattern) => pattern.test(message));
}

export function getDeployReloadMarker(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DEPLOY_ID) {
    return process.env.NEXT_PUBLIC_DEPLOY_ID;
  }
  return 'development';
}

/** Reload once per deployment when a stale/missing JS chunk is detected. */
export function scheduleDeployChunkReload(): boolean {
  if (typeof window === 'undefined') return false;

  const marker = getDeployReloadMarker();
  try {
    const previous = sessionStorage.getItem(DEPLOY_CHUNK_RELOAD_KEY);
    if (previous === marker) return false;
    sessionStorage.setItem(DEPLOY_CHUNK_RELOAD_KEY, marker);
  } catch {
    // sessionStorage may be unavailable in private mode — still attempt one reload.
  }

  window.location.reload();
  return true;
}
