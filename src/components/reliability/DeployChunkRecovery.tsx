'use client';

import { useEffect } from 'react';
import {
  isDeployChunkFailure,
  scheduleDeployChunkReload,
} from '@/src/lib/reliability/deployChunkRecovery';

/**
 * Automatically recovers from stale JS chunks after a deployment.
 * Reloads once per deployment — not a user-facing retry control.
 */
export function DeployChunkRecovery() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      if (!isDeployChunkFailure(event.error ?? event.message)) return;
      event.preventDefault();
      scheduleDeployChunkReload();
    }

    function handleRejection(event: PromiseRejectionEvent) {
      if (!isDeployChunkFailure(event.reason)) return;
      event.preventDefault();
      scheduleDeployChunkReload();
    }

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
