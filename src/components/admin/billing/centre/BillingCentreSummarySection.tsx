'use client';

import Link from 'next/link';
import type { BillingCommandCard } from '@/src/services/billingCommandCenter';
import type { BillingCentreSummaryCards } from '@/src/lib/admin/billingCentreDashboardPresentation';
import { paiseToInr } from '@/src/lib/format';

function SummaryKpi({
  label,
  value,
  sub,
  tone = 'default',
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'warn' | 'success';
  href?: string;
}) {
  const valueClass =
    tone === 'warn' ? 'text-rose-300' : tone === 'success' ? 'text-emerald-300' : 'text-white';
  const inner = (
    <>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
        {label}
      </p>
      <p className={`mt-1.5 text-xl font-bold tabular-nums leading-none ${valueClass}`}>{value}</p>
      {sub ? <p className="mt-1 truncate text-[11px] text-apg-silver">{sub}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block min-w-0 rounded-xl border border-white/10 bg-[#1A1F27] p-3 transition hover:border-[#FF5A1F]/40"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-[#1A1F27] p-3">{inner}</div>
  );
}

function toneForCard(tone: BillingCommandCard['tone']): 'default' | 'warn' {
  return tone === 'urgent' || tone === 'warn' ? 'warn' : 'default';
}

export function BillingCentreSummarySection({
  summary,
  commandCards,
}: {
  summary: BillingCentreSummaryCards;
  commandCards: BillingCommandCard[];
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white">Operations summary</h2>
        <p className="mt-0.5 text-xs text-apg-silver">Daily billing command centre at a glance.</p>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryKpi
          label="Today's collections"
          value={paiseToInr(summary.collectedTodayPaise)}
          sub={`${summary.collectedTodayCount} payments`}
          tone="success"
          href="/admin/billing?tab=paid"
        />
        <SummaryKpi
          label="Outstanding"
          value={paiseToInr(summary.outstandingPaise)}
          tone={summary.outstandingPaise > 0 ? 'warn' : 'default'}
          href="/admin/billing?tab=billing"
        />
        <SummaryKpi
          label="Upcoming bills (7d)"
          value={String(summary.upcomingBills7d)}
          href="/admin/billing?tab=dashboard#upcoming"
        />
        <SummaryKpi
          label="Residents to remind"
          value={String(summary.residentsToRemind)}
          tone={summary.residentsToRemind > 0 ? 'warn' : 'default'}
          href="/admin/billing?tab=billing"
        />
        <SummaryKpi
          label="Pending approvals"
          value={String(summary.pendingApprovals)}
          tone={summary.pendingApprovals > 0 ? 'warn' : 'default'}
          href="/admin/billing?tab=dashboard#approvals"
        />
        <SummaryKpi
          label="Vacating this week"
          value={String(summary.vacatingThisWeek)}
          href="/admin/operations?filter=vacating_requests"
        />
      </dl>
      {commandCards.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {commandCards.map((card) => (
            <Link
              key={card.id}
              href={card.href}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-[#12161C]/80 px-3 py-2 transition hover:border-[#FF5A1F]/40"
            >
              <span className="truncate text-xs text-apg-silver">{card.label}</span>
              <span
                className={`ml-2 shrink-0 text-lg font-bold tabular-nums ${
                  toneForCard(card.tone) === 'warn' ? 'text-rose-300' : 'text-white'
                }`}
              >
                {card.count}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
