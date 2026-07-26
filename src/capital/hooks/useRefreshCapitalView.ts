'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Soft-refresh Capital RSC trees after a successful server write so
 * AssetCommandCenter / dashboard props pick up recalculated TVI, timeline, etc.
 */
export function useRefreshCapitalView() {
  const router = useRouter();
  return useCallback(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[capital] refresh_requested');
    }
    router.refresh();
  }, [router]);
}
