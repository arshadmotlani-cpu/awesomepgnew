import { buildCheckoutJourneyTimeline } from '@/src/lib/checkout/checkoutJourneyTimeline';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

export function CheckoutJourneyTimeline({ detail }: { detail: CheckoutSettlementDetail }) {
  const items = buildCheckoutJourneyTimeline(detail);

  return (
    <ol className="flex gap-3 overflow-x-auto pb-1">
      {items.map((item) => (
        <li
          key={item.id}
          className={
            'flex min-w-[9.5rem] shrink-0 flex-col gap-2 rounded-2xl px-4 py-3 ring-1 ' +
            (item.state === 'current'
              ? 'bg-[#FF5A1F]/10 ring-[#FF5A1F]/40'
              : item.state === 'done'
                ? 'bg-emerald-500/5 ring-emerald-400/20'
                : 'bg-white/[0.03] ring-white/[0.06]')
          }
        >
          <span
            className={
              'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ' +
              (item.state === 'current'
                ? 'bg-[#FF5A1F] text-white'
                : item.state === 'done'
                  ? 'bg-emerald-500/25 text-emerald-200'
                  : 'bg-white/10 text-apg-silver')
            }
          >
            {item.state === 'done' ? '✓' : '·'}
          </span>
          <span
            className={
              'text-xs font-medium leading-snug ' +
              (item.state === 'current'
                ? 'text-white'
                : item.state === 'done'
                  ? 'text-emerald-100'
                  : 'text-apg-silver')
            }
          >
            {item.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
