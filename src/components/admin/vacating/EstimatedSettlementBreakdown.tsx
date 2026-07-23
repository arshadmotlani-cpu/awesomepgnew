'use client';

import { paiseToInr } from '@/src/lib/format';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';

function SettlementRow({
  row,
}: {
  row: EstimatedSettlementPreview['sections'][number]['rows'][number];
}) {
  return (
    <div className={row.emphasis ? 'rounded-2xl bg-white/[0.04] px-3 py-3' : ''}>
      <div className="flex items-start justify-between gap-3 text-sm">
        <dt className={row.emphasis ? 'font-medium text-white' : 'text-apg-silver'}>{row.label}</dt>
        <dd
          className={
            (row.emphasis ? 'text-lg font-semibold ' : 'font-medium ') +
            (row.deduct && row.value.startsWith('−')
              ? 'text-rose-200'
              : row.value.includes('Pending')
                ? 'text-amber-200/90 italic'
                : 'text-white')
          }
        >
          {row.value}
        </dd>
      </div>
      {row.hint ? (
        <p className="mt-1 text-[11px] leading-relaxed text-apg-silver">{row.hint}</p>
      ) : null}
    </div>
  );
}

export function EstimatedSettlementBreakdown({
  preview,
  compact = false,
  className = '',
}: {
  preview: EstimatedSettlementPreview;
  compact?: boolean;
  className?: string;
}) {
  const refundLabel =
    preview.mode === 'final'
      ? 'Final refund'
      : preview.mode === 'baseline'
        ? 'Estimated refund (at approval)'
        : 'Estimated refund';

  return (
    <div className={'space-y-4 ' + className}>
      <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.08] px-4 py-3">
        <p className="text-sm font-medium text-amber-100">{preview.disclaimer}</p>
      </div>

      {preview.sections.map((section) => (
        <div key={section.title}>
          <p
            className={
              'mb-2 font-semibold uppercase tracking-wider text-apg-silver/80 ' +
              (compact ? 'text-[10px]' : 'text-xs')
            }
          >
            {section.title}
          </p>
          <dl className="space-y-2.5">
            {section.rows.map((row) => (
              <SettlementRow key={row.id} row={row} />
            ))}
          </dl>
        </div>
      ))}

      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] px-4 py-4">
        <div className="flex items-end justify-between gap-3">
          <p className="text-sm font-medium text-emerald-100">{refundLabel}</p>
          <p className="text-2xl font-semibold tabular-nums text-white">
            {paiseToInr(preview.estimatedRefundPaise)}
          </p>
        </div>
        {preview.estimatedUnusedRentCreditPaise > 0 ? (
          <p className="mt-2 text-xs text-emerald-100/80">
            Includes {paiseToInr(preview.estimatedUnusedRentCreditPaise)} unused rent credit
          </p>
        ) : null}
      </div>
    </div>
  );
}
