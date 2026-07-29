'use client';

import { useTransition } from 'react';
import { markCommissionsPaidAction } from '@/src/hair/actions/loyalty';
import { Button } from '@/src/hair/components/ui/button';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export function CommissionRows({
  rows,
}: {
  rows: Array<{ staffId: string; staffName: string; pendingPaise: number; paidPaise: number }>;
}) {
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) {
    return <p className="text-sm text-fyh-text-muted">Commissions appear after paid invoices.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((c) => (
        <div key={c.staffId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="truncate text-fyh-text">{c.staffName}</span>
          <span className="shrink-0 text-fyh-text-secondary">
            Pending {formatInrFromPaise(Number(c.pendingPaise))} · Paid{' '}
            {formatInrFromPaise(Number(c.paidPaise))}
          </span>
          {Number(c.pendingPaise) > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await markCommissionsPaidAction(c.staffId);
                });
              }}
            >
              Mark paid
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
