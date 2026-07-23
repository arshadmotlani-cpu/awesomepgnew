'use client';

import { paiseToInr } from '@/src/lib/format';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';

function WaterfallRow({
  label,
  amountPaise,
  explanation,
  emphasis,
  deduct,
}: {
  label: string;
  amountPaise: number;
  explanation?: string;
  emphasis?: boolean;
  deduct?: boolean;
}) {
  const formatted =
    deduct && amountPaise > 0
      ? `−${paiseToInr(amountPaise)}`
      : label === 'Stay'
        ? `${amountPaise} day${amountPaise === 1 ? '' : 's'}`
        : paiseToInr(amountPaise);

  return (
    <div className={emphasis ? 'rounded-2xl bg-white/[0.04] px-3 py-3' : ''}>
      <div className="flex items-start justify-between gap-3 text-sm">
        <dt className={emphasis ? 'font-medium text-white' : 'text-apg-silver'}>{label}</dt>
        <dd className={emphasis ? 'text-lg font-semibold text-white' : 'font-medium text-white'}>
          {formatted}
        </dd>
      </div>
      {explanation ? (
        <p className="mt-1 text-[11px] leading-relaxed text-apg-silver">{explanation}</p>
      ) : null}
    </div>
  );
}

export function CheckoutSettlementWaterfall({
  waterfall,
  className = '',
}: {
  waterfall: CheckoutSettlementWaterfall;
  className?: string;
}) {
  const stepLabels: Record<number, string> = {
    1: 'Stay',
    2: 'Rent bucket',
    3: 'Notice',
    4: 'Notice waterfall',
    5: 'Deposit bucket',
    6: 'Other charges',
    7: 'Refund',
  };

  let lastStep = 0;

  return (
    <div className={'space-y-4 ' + className}>
      {waterfall.lines.map((line, index) => {
        const showHeading = line.step !== lastStep;
        lastStep = line.step;
        const isTotal = line.label === 'Total refund';
        const isDeduct =
          line.label.includes('deduction') ||
          line.label.includes('Taken from') ||
          line.label === 'Other deductions' ||
          line.label === 'Electricity deduction';
        return (
          <div key={`${line.step}-${line.label}-${index}`}>
            {showHeading ? (
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-apg-silver/80">
                Step {line.step} · {stepLabels[line.step] ?? 'Detail'}
              </p>
            ) : null}
            <WaterfallRow
              label={line.label}
              amountPaise={line.amountPaise}
              explanation={line.explanation}
              emphasis={isTotal}
              deduct={isDeduct}
            />
          </div>
        );
      })}

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-3 text-xs text-emerald-100/90">
        <div className="flex justify-between gap-3">
          <span>Deposit portion</span>
          <span className="font-medium">{paiseToInr(waterfall.refund.depositPortionPaise)}</span>
        </div>
        <div className="mt-1.5 flex justify-between gap-3">
          <span>Unused rent credit</span>
          <span className="font-medium">
            {paiseToInr(waterfall.refund.unusedRentPortionPaise)}
          </span>
        </div>
      </div>
    </div>
  );
}
