'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AdvancePaymentForm } from '@/src/hair/components/advance-payment/AdvancePaymentForm';
import { Button } from '@/src/hair/components/ui/button';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';

export function AdvancePaymentShell() {
  const [done, setDone] = useState<{
    customer: PosCustomerHit;
    invoiceNumber: string;
    walletBalancePaise: number;
  } | null>(null);

  if (done) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-8 text-center md:py-12">
        <div>
          <p className="fyh-section-eyebrow">Customer credit</p>
          <h1 className="fyh-display mt-2 font-semibold text-fyh-text">Advance received</h1>
          <p className="mt-2 text-sm text-fyh-text-secondary">
            {done.customer.fullName} · {done.invoiceNumber} · balance{' '}
            {formatInrFromPaise(done.walletBalancePaise)}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={`/customers/${done.customer.id}`}>
            <Button type="button">View customer</Button>
          </Link>
          <Button type="button" variant="secondary" onClick={() => setDone(null)}>
            Another advance
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-4 md:py-8">
      <div className="mb-5">
        <p className="fyh-section-eyebrow">Customer credit</p>
        <h1 className="fyh-display mt-1 font-semibold text-fyh-text">Advance payment</h1>
        <p className="mt-1 text-sm text-fyh-text-muted">
          Receive money and add customer credit — separate from service billing.
        </p>
      </div>
      <div className="fyh-panel-muted p-4 md:p-5">
        <AdvancePaymentForm
          onSuccess={(result) =>
            setDone({
              customer: result.customer,
              invoiceNumber: result.invoiceNumber,
              walletBalancePaise: result.walletBalancePaise,
            })
          }
        />
      </div>
    </div>
  );
}
