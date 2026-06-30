'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { logResidentClientError } from '@/src/lib/client/residentClientLogger';

/** Captures uncaught client errors on account routes — logs exact stack to console. */
export function PostLoginGlobalErrorObserver() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith('/account')) return;

    const onError = (event: ErrorEvent) => {
      logResidentClientError('uncaught window error on account route', event.error ?? event.message, {
        page: 'account_global_error',
        extra: {
          pathname,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          message: event.message,
        },
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      logResidentClientError('unhandled promise rejection on account route', event.reason, {
        page: 'account_global_rejection',
        extra: { pathname },
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [pathname]);

  return null;
}
