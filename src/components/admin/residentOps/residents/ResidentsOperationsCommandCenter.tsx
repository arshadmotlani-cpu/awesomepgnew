'use client';

import Link from 'next/link';
import type {
  ResidentsCommandCard,
  ResidentsCommandFilter,
} from '@/src/lib/residents/residentOperationsResidentsView';
import { OPS_ORANGE, OpsSection } from '@/src/components/admin/residentOps/residentOpsUi';

const EXTERNAL_CARD_HREF: Partial<Record<ResidentsCommandFilter, string>> = {
  payment_proof: '/admin/operations?filter=waiting_for_approval',
};

export function ResidentsOperationsCommandCenter({
  cards,
  activeFilter,
}: {
  cards: ResidentsCommandCard[];
  activeFilter: ResidentsCommandFilter | null;
}) {
  return (
    <OpsSection
      id="command-center"
      title="Operations command center"
      description="Start here — tap a card to filter the action queue below."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => {
          const isActive = activeFilter === card.id;
          const externalHref = EXTERNAL_CARD_HREF[card.id];
          const href =
            externalHref && card.count > 0
              ? externalHref
              : isActive && card.count > 0
                ? '/admin/operations#queue'
                : card.count > 0
                  ? `/admin/operations?filter=${card.id}#queue`
                  : undefined;

          const inner = (
            <>
              <p className="text-[11px] font-medium leading-snug text-apg-silver">{card.label}</p>
              <p
                className={
                  'mt-3 text-4xl font-bold tabular-nums tracking-tight ' +
                  (card.count > 0 ? 'text-[#FF5A1F]' : 'text-apg-silver/35')
                }
              >
                {card.count}
              </p>
            </>
          );

          const className =
            'flex min-h-[128px] flex-col rounded-2xl border px-4 py-4 transition ' +
            (card.count > 0
              ? 'border-white/12 bg-[#1A1F27] hover:border-[#FF5A1F]/35 hover:bg-[#1F2630]'
              : 'border-white/8 bg-[#161b22] opacity-70') +
            (isActive ? ' ring-2 ring-[#FF5A1F] ring-offset-2 ring-offset-[#121820]' : '');

          if (!href) {
            return (
              <div key={card.id} className={className}>
                {inner}
              </div>
            );
          }

          return (
            <Link key={card.id} href={href} className={className}>
              {inner}
            </Link>
          );
        })}
      </div>

      {activeFilter ? (
        <p className="mt-4 text-xs text-apg-silver">
          Filtered by{' '}
          <span className="font-semibold text-white">
            {cards.find((c) => c.id === activeFilter)?.label}
          </span>
          .{' '}
          <Link href="/admin/operations#queue" className="font-medium hover:underline" style={{ color: OPS_ORANGE }}>
            Clear filter
          </Link>
        </p>
      ) : null}
    </OpsSection>
  );
}
