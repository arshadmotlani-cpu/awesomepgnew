'use client';

import { CheckoutSettlementWaterfall } from '@/src/components/admin/checkout/CheckoutSettlementWaterfall';
import {
  buildAdminSettlementAuditBreakdown,
  type AdminSettlementAuditRow,
  type AdminSettlementAuditSection,
} from '@/src/lib/checkout/adminSettlementAuditBreakdown';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

function AuditRow({ row }: { row: AdminSettlementAuditRow }) {
  return (
    <div className={row.emphasis ? 'rounded-2xl bg-white/[0.04] px-3 py-3' : ''}>
      <div className="flex items-start justify-between gap-3 text-sm">
        <dt className={row.emphasis ? 'font-medium text-white' : 'text-apg-silver'}>{row.label}</dt>
        <dd
          className={
            (row.emphasis ? 'text-lg font-semibold ' : 'font-medium ') +
            (row.deduct && row.value.startsWith('−') ? 'text-rose-200' : 'text-white')
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

function AuditSection({ section }: { section: AdminSettlementAuditSection }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-apg-silver/80">
        {section.title}
      </p>
      <dl className="space-y-2.5">
        {section.rows.map((row) => (
          <AuditRow key={row.id} row={row} />
        ))}
      </dl>
    </div>
  );
}

export function CheckoutSettlementAuditBreakdown({
  detail,
  className = '',
  showEngineTrace = true,
}: {
  detail: CheckoutSettlementDetail;
  className?: string;
  showEngineTrace?: boolean;
}) {
  const audit = buildAdminSettlementAuditBreakdown(detail);

  return (
    <div className={'space-y-5 ' + className}>
      {audit.sections.map((section) => (
        <AuditSection key={section.title} section={section} />
      ))}

      {showEngineTrace && detail.waterfall ? (
        <details className="rounded-2xl border border-white/10 bg-white/[0.02]">
          <summary className="cursor-pointer px-4 py-3 text-xs font-medium uppercase tracking-wider text-apg-silver hover:text-white">
            Engine trace
          </summary>
          <div className="border-t border-white/10 px-4 py-4">
            <CheckoutSettlementWaterfall waterfall={detail.waterfall} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
