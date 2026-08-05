'use client';

import { useState } from 'react';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { ResidentElectricityBillExplanation } from '@/src/lib/residents/residentElectricityBillExplanationTypes';

type Theme = 'light' | 'dark';

type Props = {
  explanation: ResidentElectricityBillExplanation;
  theme?: Theme;
  defaultExpanded?: boolean;
};

export function ResidentElectricityBillCalculationPanel({
  explanation,
  theme = 'light',
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const dark = theme === 'dark';
  const shell = dark
    ? 'rounded-xl border border-white/10 bg-white/[0.03]'
    : 'rounded-xl border border-zinc-200 bg-zinc-50';
  const heading = dark ? 'text-apg-silver' : 'text-zinc-500';
  const text = dark ? 'text-white' : 'text-zinc-900';
  const muted = dark ? 'text-apg-silver' : 'text-zinc-600';
  const divider = dark ? 'border-white/10' : 'border-zinc-200';
  const card = dark ? 'border-white/10 bg-black/20' : 'border-zinc-200 bg-white';

  const { meter } = explanation;
  const rateLabel = `₹${(meter.ratePerUnitPaise / 100).toFixed(0)}`;

  return (
    <section className={shell}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5 ${dark ? 'hover:bg-white/5' : 'hover:bg-zinc-100'}`}
        aria-expanded={expanded}
      >
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>
            How this bill was calculated
          </p>
          <p className={`text-sm font-medium ${text}`}>
            Room {explanation.roomNumber} · {formatDate(explanation.billingMonth)}
          </p>
        </div>
        <span className={`text-sm ${muted}`}>{expanded ? 'Hide' : 'Show'}</span>
      </button>

      {expanded ? (
        <div className={`space-y-5 border-t px-4 py-4 sm:px-5 ${divider}`}>
          <div>
            <h4 className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>
              Room Electricity Bill
            </h4>
            <dl className={`mt-3 space-y-2 text-sm ${text}`}>
              <Row label="Billing month" value={formatDate(explanation.billingMonth)} muted={muted} />
              <Row
                label="Previous meter reading"
                value={`${meter.previousReadingUnits} units`}
                muted={muted}
              />
              <Row
                label="Current meter reading"
                value={`${meter.currentReadingUnits} units`}
                muted={muted}
              />
              <Row label="Units consumed" value={`${meter.unitsConsumed} units`} muted={muted} />
              <Row label="Rate per unit" value={rateLabel} muted={muted} />
              <Row
                label="Total room electricity bill"
                value={`${meter.unitsConsumed} Units × ${rateLabel}`}
                muted={muted}
              />
              <Row
                label="Total"
                value={paiseToInr(meter.totalRoomBillPaise)}
                muted={muted}
                emphasis
              />
            </dl>
          </div>

          <div>
            <h4 className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>
              Room Settlement
            </h4>
            <p className={`mt-1 text-xs ${muted}`}>
              Everyone who participated in this month&apos;s electricity calculation.
            </p>
            <ul className="mt-3 space-y-3">
              {explanation.participants.map((participant) => (
                <li
                  key={`${participant.name}-${participant.bedCode}`}
                  className={`rounded-xl border p-4 ${card} ${
                    participant.isViewer ? (dark ? 'border-apg-cyan/40' : 'border-orange-300') : ''
                  }`}
                >
                  <p className={`font-medium ${text}`}>
                    {participant.name}
                    {participant.bedCode !== '—' ? ` (Bed ${participant.bedCode})` : ''}
                  </p>
                  <p className={`mt-1 text-xs ${muted}`}>{participant.stayDurationLabel}</p>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                    <span className={`font-semibold tabular-nums ${text}`}>
                      {paiseToInr(participant.amountAllocatedPaise)}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        participant.status === 'Pending'
                          ? 'text-amber-600'
                          : participant.status === 'Paid'
                            ? 'text-emerald-600'
                            : muted
                      }`}
                    >
                      {participant.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>Summary</h4>
            <dl className={`mt-3 space-y-2 text-sm ${text}`}>
              <Row
                label="Room Total"
                value={paiseToInr(explanation.summary.roomTotalPaise)}
                muted={muted}
              />
              <Row
                label="Recovered from Deposit"
                value={paiseToInr(explanation.summary.recoveredFromDepositPaise)}
                muted={muted}
              />
              <Row
                label="Collected"
                value={paiseToInr(explanation.summary.collectedPaise)}
                muted={muted}
              />
              <Row
                label="Outstanding"
                value={paiseToInr(explanation.summary.outstandingPaise)}
                muted={muted}
              />
              <Row
                label="Your Share"
                value={paiseToInr(explanation.summary.yourSharePaise)}
                muted={muted}
                emphasis
              />
              <Row label="Late Fee" value={explanation.summary.lateFeeLabel} muted={muted} />
            </dl>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Row({
  label,
  value,
  muted,
  emphasis,
}: {
  label: string;
  value: string;
  muted: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className={muted}>{label}</dt>
      <dd className={emphasis ? 'font-semibold tabular-nums' : 'font-medium tabular-nums'}>
        {value}
      </dd>
    </div>
  );
}
