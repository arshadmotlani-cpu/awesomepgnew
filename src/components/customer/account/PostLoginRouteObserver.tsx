'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { logResidentClientInfo } from '@/src/lib/client/residentClientLogger';

type Props = {
  step: string;
  customerId?: string | null;
  email?: string | null;
  extra?: Record<string, unknown>;
};

/** Temporary post-login instrumentation — logs each client mount step. */
export function PostLoginRouteObserver({ step, customerId, email, extra }: Props) {
  const pathname = usePathname();

  useEffect(() => {
    logResidentClientInfo('post-login flow step', {
      page: step,
      customerId,
      email,
      extra: {
        pathname,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        ...extra,
      },
    });
  }, [step, customerId, email, pathname, extra]);

  return null;
}
