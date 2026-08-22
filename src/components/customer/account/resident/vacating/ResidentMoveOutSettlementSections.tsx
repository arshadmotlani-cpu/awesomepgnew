'use client';

import { ApgCard } from '@/src/components/customer/design-system';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import { paiseToInr } from '@/src/lib/format';

export function ResidentMoveOutSettlementSections({
  preview,
  walletCreditPaise = 0,
}: {
  preview: EstimatedSettlementPreview;
  walletCreditPaise?: number;
}) {
  return (
    <div className="space-y-3">
      {preview.sections.map((section) => (
        <ApgCard key={section.title} tier="resident" className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-orange">
            {section.title}
          </h3>
          <dl className="space-y-2">
            {section.rows.map((row) => (
              <div
                key={row.id}
                className={`flex items-start justify-between gap-3 text-sm ${
                  row.deduct ? 'text-rose-200' : 'text-white'
                }`}
              >
                <dt className="text-apg-silver">{row.label}</dt>
                <dd className="shrink-0 text-right font-medium tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
        </ApgCard>
      ))}

      <ApgCard tier="resident" className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-orange">Wallet</h3>
        <dl className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-apg-silver">Unused rent wallet credit</dt>
          <dd className="font-medium tabular-nums text-white">{paiseToInr(walletCreditPaise)}</dd>
        </dl>
      </ApgCard>

      <ApgCard tier="resident" className="border-emerald-500/30 bg-emerald-950/20">
        <dl className="flex items-center justify-between gap-3">
          <dt className="text-sm font-medium text-emerald-100">Estimated refundable amount</dt>
          <dd className="text-lg font-bold tabular-nums text-emerald-300">
            {preview.mode !== 'final' ? '≈ ' : ''}
            {paiseToInr(preview.estimatedRefundPaise)}
          </dd>
        </dl>
        {preview.disclaimer ? (
          <p className="mt-2 text-[11px] leading-relaxed text-apg-silver">{preview.disclaimer}</p>
        ) : null}
      </ApgCard>
    </div>
  );
}
