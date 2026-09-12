'use client';

import { useEffect, useState } from 'react';
import { loadCustomerContextForPosAction } from '@/src/hair/actions/booking';
import { listAvailablePackageServicesAction } from '@/src/hair/actions/packages';

export type QuickSaleCustomerContext = {
  lastVisitLabel: string;
  walletPaise: number;
  duePaise: number;
  packageCreditsRemaining: number;
};

export function useQuickSaleCustomerContext(customerId: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<QuickSaleCustomerContext | null>(null);

  useEffect(() => {
    if (!customerId) {
      setContext(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      loadCustomerContextForPosAction(customerId),
      listAvailablePackageServicesAction(customerId),
    ])
      .then(([ctxRes, creditsRes]) => {
        if (cancelled) return;
        if (!ctxRes.ok) {
          setContext(null);
          setError(ctxRes.error);
          return;
        }
        const packageCreditsRemaining = creditsRes.credits.reduce(
          (sum, row) => sum + Math.max(0, row.remaining),
          0,
        );
        setContext({
          lastVisitLabel: ctxRes.data.lastVisit?.displayDate ?? 'Never',
          walletPaise: ctxRes.data.financial.walletPaise,
          duePaise: ctxRes.data.financial.duePaise,
          packageCreditsRemaining,
        });
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setContext(null);
          setError(err instanceof Error ? err.message : 'Failed to load customer context');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return { loading, error, context };
}
