'use client';

import { paiseToInr } from '@/src/lib/format';
import type { ResidentExitBrainSnapshot } from '@/src/lib/exit/exitBrainTypes';

type Theme = 'light' | 'dark';

export function ExitBrainRefundBreakdown({
  snapshot,
  theme = 'light',
  title = 'Estimated Deposit Refund',
}: {
  snapshot: ResidentExitBrainSnapshot;
  theme?: Theme;
  title?: string;
}) {
  const dark = theme === 'dark';
  const shell = dark
    ? 'rounded-xl border border-white/10 bg-white/[0.03]'
    : 'rounded-xl border border-zinc-200 bg-zinc-50';
  const heading = dark ? 'text-white' : 'text-zinc-900';
  const muted = dark ? 'text-apg-silver' : 'text-zinc-600';
  const divider = dark ? 'border-white/10' : 'border-zinc-200';

  const displayLines = snapshot.refundEstimate.lines.filter(
    (line) => line.key !== 'estimated_refund',
  );
  const refundLine = snapshot.refundEstimate.lines.find((l) => l.key === 'estimated_refund');

  return (
    <section className={`${shell} p-4 sm:p-5`}>
      <h3 className={`text-sm font-semibold ${heading}`}>{title}</h3>
      {snapshot.lifecycle.isExitMode ? (
        <p className={`mt-1 text-xs ${muted}`}>
          Exit mode active — penalties and late fees are frozen. Updates when you pay outstanding
          bills.
        </p>
      ) : null}

      <dl className={`mt-4 space-y-2 border-t pt-4 text-sm ${divider}`}>
        {displayLines.map((line) => (
          <div key={line.key} className="flex items-center justify-between gap-3">
            <dt className={muted}>{line.label}</dt>
            <dd
              className={`font-medium tabular-nums ${
                line.amountPaise < 0 ? 'text-rose-600' : heading
              }`}
            >
              {line.amountPaise < 0 ? `-${paiseToInr(Math.abs(line.amountPaise))}` : paiseToInr(line.amountPaise)}
            </dd>
          </div>
        ))}
      </dl>

      {snapshot.electricity.estimatedCheckout.pending &&
      !snapshot.electricity.estimatedCheckout.residentSharePaise ? (
        <p className={`mt-3 text-xs ${muted}`}>
          {snapshot.electricity.estimatedCheckout.label} — upload your checkout meter photo when
          requesting refund.
        </p>
      ) : null}

      {refundLine ? (
        <div className={`mt-4 flex items-center justify-between gap-3 border-t pt-4 ${divider}`}>
          <span className={`text-sm font-semibold ${heading}`}>{refundLine.label}</span>
          <span
            className={`text-lg font-bold tabular-nums ${
              refundLine.amountPaise < 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {refundLine.amountPaise < 0
              ? `-${paiseToInr(Math.abs(refundLine.amountPaise))}`
              : paiseToInr(refundLine.amountPaise)}
          </span>
        </div>
      ) : null}

      {snapshot.refundEstimate.confidencePercent < 100 ? (
        <div className={`mt-3 rounded-lg border px-3 py-2 ${divider} ${dark ? 'border-white/10' : 'border-zinc-200'}`}>
          <p className={`text-xs font-medium ${heading}`}>
            Confidence {snapshot.refundEstimate.confidencePercent}%
          </p>
          {snapshot.refundEstimate.confidenceReasons.length > 0 ? (
            <ul className={`mt-1 space-y-0.5 text-[11px] ${muted}`}>
              {snapshot.refundEstimate.confidenceReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className={`mt-3 text-[11px] ${muted}`}>{snapshot.refundEstimate.disclaimer}</p>

      {snapshot.autoRecoverFromDeposit ? (
        <p className={`mt-2 text-xs font-medium text-amber-600`}>
          Outstanding dues will be recovered from your deposit during settlement.
        </p>
      ) : null}
    </section>
  );
}
