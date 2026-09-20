'use client';

import { useEffect } from 'react';
import {
  cleanDeployRecoveryParamsFromLocation,
  fetchLiveDeployIdFromDocument,
  getBundledDeployId,
  isDeployChunkFailure,
  scheduleDeployChunkRecovery,
  shouldRecoverAfterBfcache,
} from '@/src/lib/reliability/deployChunkRecovery';

/**
 * Recovers from stale JS/CSS chunks and deploy skew after a production release.
 * Uses bounded, cache-busting same-origin navigation (cookies and route preserved).
 */
export function DeployChunkRecovery() {
  useEffect(() => {
    cleanDeployRecoveryParamsFromLocation();
  }, []);

  useEffect(() => {
    function handleError(event: ErrorEvent) {
      const source = event.filename || null;
      if (!isDeployChunkFailure(event.error ?? event.message, { source })) return;
      event.preventDefault();
      scheduleDeployChunkRecovery();
    }

    function handleRejection(event: PromiseRejectionEvent) {
      if (!isDeployChunkFailure(event.reason)) return;
      event.preventDefault();
      scheduleDeployChunkRecovery();
    }

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;

      void (async () => {
        const bundled = getBundledDeployId();
        const live = await fetchLiveDeployIdFromDocument(fetch, window.location);
        if (!shouldRecoverAfterBfcache(bundled, live)) return;
        scheduleDeployChunkRecovery();
      })();
    }

    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  return null;
}
