import Link from 'next/link';
import type { CheckoutSettlementListTab } from '@/src/services/checkoutSettlement';

const PRIMARY =
  'inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110';
const SECONDARY =
  'inline-flex items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5';

export function CheckoutSettlementsPrimaryActions({
  tab,
  count,
}: {
  tab: CheckoutSettlementListTab;
  count: number;
}) {
  const actions: Array<{ key: string; href: string; label: string; primary?: boolean }> = [];

  if (count > 0 && tab === 'awaiting_review') {
    actions.push({
      key: 'open-first',
      href: '#settlement-queue',
      label: 'Review settlements below',
      primary: true,
    });
  } else if (count > 0 && tab === 'refund_pending') {
    actions.push({
      key: 'refund',
      href: '#settlement-queue',
      label: 'Send refunds below',
      primary: true,
    });
  } else if (count > 0) {
    actions.push({
      key: 'open',
      href: '#settlement-queue',
      label: `Open ${count} in queue`,
      primary: true,
    });
  }

  actions.push({ key: 'vacating', href: '/admin/vacating?status=approved', label: 'Move-out requests' });
  actions.push({
    key: 'tab-review',
    href: '/admin/checkout-settlements?tab=awaiting_review',
    label: 'Ready for review',
  });
  actions.push({
    key: 'tab-refund',
    href: '/admin/checkout-settlements?tab=refund_pending',
    label: 'Refunds to send',
  });

  const visible = actions.slice(0, 5);

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-base font-semibold text-white">What to do next</h2>
      <p className="mt-1 text-sm text-apg-silver">
        {tab === 'awaiting_resident' && count > 0
          ? 'Waiting for residents to submit UPI ID and meter photo. You can nudge them from their profile.'
          : tab === 'awaiting_review' && count > 0
            ? 'Review deductions and approve the final refund amount.'
            : tab === 'refund_pending' && count > 0
              ? 'Send the refund, then mark it paid with the UPI reference.'
              : 'Pick a queue tab above or check move-out requests.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {visible.map((action) => (
          <Link key={action.key} href={action.href} className={action.primary ? PRIMARY : SECONDARY}>
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
