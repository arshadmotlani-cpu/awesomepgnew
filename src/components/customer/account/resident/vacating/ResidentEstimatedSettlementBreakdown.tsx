'use client';

import { paiseToInr } from '@/src/lib/format';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';

function Row({
  row,
}: {
  row: EstimatedSettlementPreview['sections'][number]['rows'][number];
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="text-zinc-600">{row.label}</dt>
      <dd
        className={
          'font-medium ' +
          (row.deduct && row.value.startsWith('−')
            ? 'text-rose-700'
            : row.value.includes('Pending')
              ? 'text-amber-800 italic'
              : 'text-zinc-900')
        }
      >
        {row.value}
      </dd>
    </div>
  );
}

export function ResidentEstimatedSettlementBreakdown({
  preview,
  className = '',
}: {
  preview: EstimatedSettlementPreview;
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
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm text-amber-950">{preview.disclaimer}</p>
      </div>

      {preview.sections.map((section) => (
        <div key={section.title}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {section.title}
          </p>
          <dl className="space-y-2">
            {section.rows.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </dl>
        </div>
      ))}

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex items-end justify-between gap-3">
          <p className="text-sm font-medium text-emerald-900">{refundLabel}</p>
          <p className="text-xl font-semibold tabular-nums text-emerald-950">
            {paiseToInr(preview.estimatedRefundPaise)}
          </p>
        </div>
      </div>
    </div>
  );
}
