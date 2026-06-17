'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createStaleGuard, fetchPanelData, getPanelCache } from '@/src/lib/admin/panelFetch';

type FetchState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

/**
 * Cached fetch with stale-response guard and in-flight deduplication.
 */
export function useAdminCachedFetch<T>(
  cacheKey: string | null,
  fetcher: () => Promise<T>,
  opts?: { ttlMs?: number; enabled?: boolean },
) {
  const guardRef = useRef(createStaleGuard());
  const [state, setState] = useState<FetchState<T>>(() => {
    if (!cacheKey) return { data: null, loading: false, error: null };
    const cached = getPanelCache<T>(cacheKey);
    return { data: cached, loading: cached == null, error: null };
  });

  const run = useCallback(
    async (force = false) => {
      if (!cacheKey || opts?.enabled === false) return;

      const cached = !force ? getPanelCache<T>(cacheKey) : null;
      if (cached != null) {
        setState({ data: cached, loading: false, error: null });
        return cached;
      }

      const version = guardRef.current.next();
      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const data = await fetchPanelData(cacheKey, fetcher, {
          ttlMs: opts?.ttlMs,
          force,
        });
        if (guardRef.current.isStale(version)) return data;
        setState({ data, loading: false, error: null });
        return data;
      } catch (err) {
        if (guardRef.current.isStale(version)) return null;
        const message = err instanceof Error ? err.message : 'Request failed.';
        setState({ data: null, loading: false, error: message });
        return null;
      }
    },
    [cacheKey, fetcher, opts?.enabled, opts?.ttlMs],
  );

  useEffect(() => {
    guardRef.current.next();
    if (!cacheKey || opts?.enabled === false) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const cached = getPanelCache<T>(cacheKey);
    if (cached != null) {
      setState({ data: cached, loading: false, error: null });
      return;
    }
    void run(false);
  }, [cacheKey, opts?.enabled, run]);

  const refresh = useCallback(() => run(true), [run]);

  return { ...state, refresh };
}
