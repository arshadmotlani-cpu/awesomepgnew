'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isCurrentBillingMonth } from '@/src/lib/billing/monthNavigation';

/** Keep the current billing month live without affecting historical snapshots. */
export function RevenueLiveRefresh({ billingMonth }: { billingMonth: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!isCurrentBillingMonth(billingMonth)) return;

    const id = window.setInterval(() => {
      router.refresh();
    }, 60_000);

    return () => window.clearInterval(id);
  }, [billingMonth, router]);

  return null;
}
