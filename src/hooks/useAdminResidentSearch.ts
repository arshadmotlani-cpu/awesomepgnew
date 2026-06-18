'use client';

import { useEffect, useState } from 'react';
import { fetchAdminResidents } from '@/src/lib/admin/residentSearchClient';
import type {
  AdminResidentSearchErrorCode,
  AdminResidentSearchResult,
} from '@/src/lib/admin/residentSearchTypes';

export type UseAdminResidentSearchOptions = {
  debounceMs?: number;
  kycApprovedOnly?: boolean;
  minLength?: number;
};

export function useAdminResidentSearch(options: UseAdminResidentSearchOptions = {}) {
  const { debounceMs = 300, kycApprovedOnly = false, minLength = 2 } = options;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminResidentSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<AdminResidentSearchErrorCode | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < minLength) {
      setResults([]);
      setError(null);
      setErrorCode(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        setErrorCode(null);
        const result = await fetchAdminResidents(trimmed, {
          kycApprovedOnly,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setResults([]);
          setError(result.error);
          setErrorCode(result.code);
        } else {
          setResults(result.data);
          setError(null);
          setErrorCode(null);
        }
        setLoading(false);
      })();
    }, debounceMs);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, debounceMs, kycApprovedOnly, minLength]);

  const showEmpty =
    query.trim().length >= minLength && !loading && !error && results.length === 0;

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    errorCode,
    showEmpty,
    emptyMessage: 'No residents found.',
  };
}
