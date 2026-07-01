'use client';

import { useState } from 'react';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type {
  ElectricityBillCalculationBreakdown,
  ElectricityBreakdownViewerContext,
} from '@/src/lib/billing/electricityBillBreakdownTypes';

type Theme = 'light' | 'dark';

type Props = {
  breakdown: ElectricityBillCalculationBreakdown;
  viewer?: ElectricityBreakdownViewerContext | null;
  theme?: Theme;
  defaultExpanded?: boolean;
};

export function ElectricityBillCalculationBreakdownPanel({
  breakdown,
  viewer,
  theme = 'light',
  defaultExpanded = true,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const dark = theme === 'dark';
  const shell = dark
    ? 'rounded-2xl border border-white/10 bg-white/[0.03]'
    : 'rounded-2xl border border-zinc-200 bg-zinc-50';
  const heading = dark ? 'text-apg-silver' : 'text-zinc-500';
  const text = dark ? 'text-white' : 'text-zinc-900';
  const muted = dark ? 'text-apg-silver' : 'text-zinc-600';
  const divider = dark ? 'border-white/10' : 'border-zinc-200';

  const monthLabel = formatDate(breakdown.billingMonth);
  const m = breakdown.meter;
  const departed = breakdown.timeline.filter((t) => t.role === 'departed');
  const active = breakdown.timeline.filter((t) => t.role === 'active');

  return (
    <section className={`${shell} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5 ${dark ? 'hover:bg-white/5' : 'hover:bg-zinc-100'}`}
        aria-expanded={expanded}
      >
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>
            Electricity calculation
          </p>
          <p className={`text-sm font-medium ${text}`}>
            Room {breakdown.roomNumber} · {monthLabel}
          </p>
        </div>
        <span className={`text-sm ${muted}`}>{expanded ? 'Hide' : 'Show'} breakdown</span>
      </button>

      {expanded ? (
        <div className={`space-y-5 border-t px-4 py-4 sm:px-5 ${divider}`}>
          <MeterSection breakdown={breakdown} dark={dark} text={text} muted={muted} heading={heading} />
          <SharingSection breakdown={breakdown} dark={dark} text={text} muted={muted} heading={heading} />
          <AlreadyCollectedSection breakdown={breakdown} dark={dark} text={text} muted={muted} heading={heading} divider={divider} />
          <BillTimelineSection breakdown={breakdown} dark={dark} text={text} muted={muted} heading={heading} />

          {departed.length > 0 ? (
            <div>
              <h4 className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>
                Occupancy timeline — previous residents
              </h4>
              <ul className="mt-3 space-y-3">
                {departed.map((entry) => (
                  <TimelineCard key={entry.bookingId} entry={entry} dark={dark} text={text} muted={muted} divider={divider} />
                ))}
              </ul>
            </div>
          ) : null}

          {active.length > 0 ? (
            <div>
              <h4 className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>
                {viewer ? 'Your bill' : 'Active residents'}
              </h4>
              <RemainingBalanceSection
                viewer={viewer}
                dark={dark}
                text={text}
                muted={muted}
              />
              <ul className="mt-3 space-y-3">
                {active.map((entry) => (
                  <TimelineCard
                    key={entry.bookingId}
                    entry={entry}
                    dark={dark}
                    text={text}
                    muted={muted}
                    divider={divider}
                    highlight={viewer?.customerId === entry.customerId}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SharingSection({
  breakdown,
  dark,
  text,
  muted,
  heading,
}: {
  breakdown: ElectricityBillCalculationBreakdown;
  dark: boolean;
  text: string;
  muted: string;
  heading: string;
}) {
  const billable = breakdown.timeline.filter(
    (t) => t.calculatedSharePaise > 0 || t.monthlyInvoiceAmountPaise > 0,
  );
  const activeCount = breakdown.timeline.filter((t) => t.role === 'active').length;
  const isPrivateRoom = activeCount === 1 && billable.length <= 1;
  const sharingCount = Math.max(1, billable.length);
  const equalSharePaise =
    !breakdown.useProRata && sharingCount > 0
      ? Math.floor(breakdown.meter.grossTotalPaise / sharingCount)
      : 0;

  return (
    <div>
      <h4 className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>Your share</h4>
      <dl className={`mt-3 space-y-2 text-sm ${text}`}>
        <Row
          label="Residents sharing"
          value={isPrivateRoom ? '1 · Private room' : String(sharingCount)}
          muted={muted}
        />
        {!isPrivateRoom && equalSharePaise > 0 ? (
          <Row label="Equal share (before settlements)" value={paiseToInr(equalSharePaise)} muted={muted} />
        ) : null}
        {breakdown.useProRata ? (
          <Row label="Split method" value="Pro-rated by days stayed" muted={muted} />
        ) : isPrivateRoom ? (
          <Row label="Split method" value="Private room — full room bill" muted={muted} />
        ) : (
          <Row label="Split method" value="Equal split among residents" muted={muted} />
        )}
      </dl>
    </div>
  );
}

function AlreadyCollectedSection({
  breakdown,
  dark,
  text,
  muted,
  heading,
  divider,
}: {
  breakdown: ElectricityBillCalculationBreakdown;
  dark: boolean;
  text: string;
  muted: string;
  heading: string;
  divider: string;
}) {
  const credits = breakdown.adjustments.checkoutCredits;
  const prepaid = breakdown.adjustments.prepaidCreditPaise;
  const manual = breakdown.adjustments.manualCreditPaise;
  const totalCollected =
    credits.reduce((sum, c) => sum + c.amountPaise, 0) + prepaid + manual;
  if (totalCollected <= 0) return null;

  return (
    <div>
      <h4 className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>Already collected</h4>
      <ul className={`mt-3 space-y-2 text-sm ${text}`}>
        {credits.map((credit) => {
          const method =
            credit.recoveredFromDepositPaise > 0 &&
            credit.recoveredFromDepositPaise >= credit.amountPaise
              ? 'Deposit deduction'
              : credit.collectedDuringCheckoutPaise > 0
                ? 'Collected at checkout'
                : 'Credit applied';
          return (
            <li
              key={credit.customerId}
              className={`flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2 ${dark ? 'border-white/10 bg-black/20' : 'border-zinc-200 bg-white'}`}
            >
              <div>
                <p className="font-medium">{credit.customerName}</p>
                <p className={`text-xs ${muted}`}>{method}</p>
              </div>
              <span className="font-semibold tabular-nums">{paiseToInr(credit.amountPaise)}</span>
            </li>
          );
        })}
        {prepaid > 0 ? (
          <li className={`flex justify-between gap-2 text-sm ${text}`}>
            <span className={muted}>{breakdown.adjustments.prepaidCreditNote ?? 'Prepaid credit'}</span>
            <span className="font-semibold tabular-nums">{paiseToInr(prepaid)}</span>
          </li>
        ) : null}
        {manual > 0 ? (
          <li className={`flex justify-between gap-2 text-sm ${text}`}>
            <span className={muted}>Manual / offline credit</span>
            <span className="font-semibold tabular-nums">{paiseToInr(manual)}</span>
          </li>
        ) : null}
      </ul>
      <dl className={`mt-4 space-y-2 text-sm ${text}`}>
        <Row label="Room bill" value={paiseToInr(breakdown.meter.grossTotalPaise)} muted={muted} />
        <Row label="Already collected" value={`−${paiseToInr(totalCollected)}`} muted={muted} />
        <div className={`border-t pt-2 ${divider}`}>
          <Row label="Remaining" value={paiseToInr(breakdown.remainingBillPaise)} muted={muted} emphasis />
        </div>
      </dl>
    </div>
  );
}

function BillTimelineSection({
  breakdown,
  dark,
  text,
  muted,
  heading,
}: {
  breakdown: ElectricityBillCalculationBreakdown;
  dark: boolean;
  text: string;
  muted: string;
  heading: string;
}) {
  const monthStart = formatDate(breakdown.billingMonth);
  const events: Array<{ date: string; label: string; amount?: string }> = [
    { date: monthStart, label: 'Opening meter reading recorded' },
  ];

  for (const entry of breakdown.timeline) {
    if (entry.role === 'departed' && entry.vacatedOn) {
      if (entry.recoveredFromDepositPaise > 0) {
        events.push({
          date: formatDate(entry.vacatedOn),
          label: `${entry.customerName} vacated — deposit deduction`,
          amount: paiseToInr(entry.recoveredFromDepositPaise),
        });
      } else if (entry.collectedDuringCheckoutPaise > 0) {
        events.push({
          date: formatDate(entry.vacatedOn),
          label: `${entry.customerName} vacated — collected at checkout`,
          amount: paiseToInr(entry.collectedDuringCheckoutPaise),
        });
      } else if (entry.creditAppliedToRoomBillPaise > 0) {
        events.push({
          date: formatDate(entry.vacatedOn),
          label: `${entry.customerName} vacated — share settled`,
          amount: paiseToInr(entry.creditAppliedToRoomBillPaise),
        });
      }
    }
  }

  events.push({
    date: formatDate(breakdown.generatedAt),
    label: 'Closing meter · bill generated',
    amount: paiseToInr(breakdown.meter.grossTotalPaise),
  });

  return (
    <div>
      <h4 className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>Bill timeline</h4>
      <ol className={`mt-3 space-y-2 text-sm ${text}`}>
        {events.map((event, idx) => (
          <li key={`${event.date}-${idx}`} className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{event.label}</p>
              <p className={`text-xs ${muted}`}>{event.date}</p>
            </div>
            {event.amount ? (
              <span className="font-semibold tabular-nums">{event.amount}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function MeterSection({
  breakdown,
  dark,
  text,
  muted,
  heading,
}: {
  breakdown: ElectricityBillCalculationBreakdown;
  dark: boolean;
  text: string;
  muted: string;
  heading: string;
}) {
  const m = breakdown.meter;
  return (
    <div>
      <h4 className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>Meter reading</h4>
      <dl className={`mt-3 grid gap-2 text-sm sm:grid-cols-2 ${text}`}>
        <Row label="Previous reading" value={String(m.previousReadingUnits)} muted={muted} />
        <Row label="Current reading" value={String(m.currentReadingUnits)} muted={muted} />
        <Row label="Units consumed" value={`${m.unitsConsumed} units`} muted={muted} />
        <Row label="Rate" value={`${paiseToInr(m.ratePerUnitPaise)} / unit`} muted={muted} />
        <Row
          label="Total room electricity"
          value={paiseToInr(m.grossTotalPaise)}
          muted={muted}
          emphasis
        />
      </dl>
    </div>
  );
}

function RemainingBalanceSection({
  viewer,
  dark,
  text,
  muted,
}: {
  viewer?: ElectricityBreakdownViewerContext | null;
  dark: boolean;
  text: string;
  muted: string;
}) {
  if (!viewer || viewer.amountPayablePaise <= 0) return null;

  return (
    <div className={`mt-3 rounded-xl border p-4 ${dark ? 'border-white/10 bg-black/20' : 'border-zinc-200 bg-white'}`}>
      <dl className={`space-y-2 text-sm ${text}`}>
        <Row
          label="Amount payable by you"
          value={paiseToInr(viewer.amountPayablePaise)}
          muted={muted}
          accent
        />
      </dl>
    </div>
  );
}

function TimelineCard({
  entry,
  dark,
  text,
  muted,
  divider,
  highlight,
}: {
  entry: ElectricityBillCalculationBreakdown['timeline'][number];
  dark: boolean;
  text: string;
  muted: string;
  divider: string;
  highlight?: boolean;
}) {
  const shell = highlight
    ? dark
      ? 'border-[#FF5A1F]/40 bg-[#FF5A1F]/10'
      : 'border-orange-300 bg-orange-50'
    : dark
      ? 'border-white/10 bg-black/20'
      : 'border-zinc-200 bg-white';

  const title =
    entry.role === 'departed'
      ? `${entry.customerName}${entry.vacatedOn ? ` (vacated ${formatDate(entry.vacatedOn)})` : ''}`
      : entry.customerName;

  return (
    <li className={`rounded-xl border p-4 ${shell}`}>
      <p className={`font-medium ${text}`}>{title}</p>
      <p className={`mt-1 text-xs ${muted}`}>Stayed: {entry.stayLabel}</p>
      <dl className={`mt-3 space-y-1.5 text-sm ${text}`}>
        {entry.calculatedSharePaise > 0 ? (
          <Row label="Share calculated" value={paiseToInr(entry.calculatedSharePaise)} muted={muted} />
        ) : null}
        {entry.recoveredFromDepositPaise > 0 ? (
          <Row
            label="Recovered from deposit"
            value={paiseToInr(entry.recoveredFromDepositPaise)}
            muted={muted}
          />
        ) : null}
        {entry.collectedDuringCheckoutPaise > 0 ? (
          <Row
            label="Collected during checkout"
            value={paiseToInr(entry.collectedDuringCheckoutPaise)}
            muted={muted}
          />
        ) : null}
        {entry.monthlyInvoiceAmountPaise > 0 ? (
          <Row
            label="Monthly invoice"
            value={paiseToInr(entry.monthlyInvoiceAmountPaise)}
            muted={muted}
            emphasis
          />
        ) : null}
      </dl>
      <p className={`mt-2 text-xs font-medium ${entry.role === 'departed' ? 'text-emerald-600' : muted}`}>
        {entry.settlementStatusLabel}
      </p>
    </li>
  );
}

function Row({
  label,
  value,
  muted,
  emphasis,
  accent,
}: {
  label: string;
  value: string;
  muted: string;
  emphasis?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className={muted}>{label}</dt>
      <dd
        className={
          accent
            ? 'text-lg font-bold text-[#FF5A1F]'
            : emphasis
              ? 'font-semibold'
              : 'font-medium tabular-nums'
        }
      >
        {value}
      </dd>
    </div>
  );
}
