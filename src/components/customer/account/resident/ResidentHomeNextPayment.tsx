import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { GlossaryTip } from '@/src/components/customer/account/resident/GlossaryTip';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { residentTabHref } from '@/src/lib/accountNavigation';
import type { UpcomingPaymentRow } from '@/src/components/customer/account/resident/ResidentUpcomingPayments';

export function ResidentHomeNextPayment({ payment }: { payment: UpcomingPaymentRow | null }) {
  if (!payment) {
    return (
      <ApgCard tier="account" className="p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Next payment</h2>
        <p className="mt-2 text-sm text-zinc-600">
          No bills waiting right now. Rent bills usually appear on the 1st of each month.
        </p>
      </ApgCard>
    );
  }

  return (
    <ApgCard tier="account" className="p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Next payment</h2>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-base font-medium text-zinc-900">{payment.label}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {payment.dueDate ? (
              <>
                Due {formatDate(payment.dueDate)} ·{' '}
                <GlossaryTip term="Pay after this date and a late fee may be added to your bill.">
                  {payment.status}
                </GlossaryTip>
              </>
            ) : (
              payment.status
            )}
          </p>
        </div>
        <p className="text-2xl font-bold tabular-nums text-zinc-900">
          {paiseToInr(payment.amountPaise)}
        </p>
      </div>
      <Link
        href={residentTabHref('payments')}
        className="mt-4 inline-block text-xs font-semibold text-indigo-700 hover:text-indigo-600"
      >
        See all bills →
      </Link>
    </ApgCard>
  );
}
