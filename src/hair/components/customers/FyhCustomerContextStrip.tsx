'use client';

import { useEffect, useState } from 'react';
import { loadCustomerContextForPosAction } from '@/src/hair/actions/booking';
import { CustomerVisitHistoryPanel } from '@/src/hair/components/booking/CustomerVisitHistoryPanel';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { formatSalonDisplayDate } from '@/src/hair/lib/formatSalonDate';
import type { CustomerBookingContext } from '@/src/hair/services/bookingContext';
import { cn } from '@/src/hair/lib/utils';

type Props = {
  customerId: string;
  customerName: string;
  variant?: 'compact' | 'sidebar';
  className?: string;
};

export function FyhCustomerContextStrip({
  customerId,
  customerName,
  variant = 'compact',
  className,
}: Props) {
  const [ctx, setCtx] = useState<CustomerBookingContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadCustomerContextForPosAction(customerId)
      .then((data) => {
        if (!cancelled) setCtx(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (loading) {
    return (
      <div className={cn('fyh-customer-context text-fyh-text-muted', className)}>
        Loading customer…
      </div>
    );
  }

  const walletPaise = ctx?.financial.walletPaise ?? 0;
  const duePaise = ctx?.financial.duePaise ?? 0;
  const lastVisitLabel = ctx?.lastVisit?.displayDate
    ? ctx.lastVisit.displayDate
    : 'Never';

  return (
    <>
      <div
        className={cn(
          'fyh-customer-context',
          variant === 'sidebar' && 'flex-col items-start gap-2',
          className,
        )}
      >
        <div className="fyh-customer-context-item">
          <span>Last visit</span>
          <button
            type="button"
            className="fyh-customer-context-link"
            onClick={() => setHistoryOpen(true)}
          >
            {lastVisitLabel}
          </button>
        </div>
        <div className="fyh-customer-context-item">
          <span>Available credit</span>
          <span className="fyh-customer-context-value">{formatInrFromPaise(walletPaise)}</span>
        </div>
        {duePaise > 0 ? (
          <div className="fyh-customer-context-item">
            <span>Due balance</span>
            <span className="fyh-customer-context-value text-fyh-warning">
              {formatInrFromPaise(duePaise)}
            </span>
          </div>
        ) : null}
      </div>

      <CustomerVisitHistoryPanel
        customerId={customerId}
        customerName={customerName}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  );
}

/** Format last visit from ISO day key for display */
export function formatLastVisitDisplay(dayIso: string | null | undefined): string {
  if (!dayIso) return 'Never';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) return formatSalonDisplayDate(dayIso);
  return dayIso;
}
