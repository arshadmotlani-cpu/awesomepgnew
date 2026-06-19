import { paiseToInr } from '@/src/lib/format';
import type { UnifiedDepositView } from '@/src/lib/deposits/unifiedDepositView';
import { sanitizeUnifiedDepositView } from '@/src/lib/deposits/unifiedDepositView';

export function DepositSummaryCard({
  view,
  invoiceStatus,
  syncWarning,
}: {
  view?: Partial<UnifiedDepositView> | null;
  invoiceStatus?: string | null;
  syncWarning?: string | null;
}) {
  const v = sanitizeUnifiedDepositView(view);

  if (!view || !v.bookingId) {
    return null;
  }

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
            Deposit summary
          </h2>
          <p className="mt-1 text-xs text-apg-silver">Current balance for this booking</p>
        </div>
        {invoiceStatus ? (
          <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-apg-silver">
            {invoiceStatus}
          </span>
        ) : null}
      </div>

      {syncWarning ? (
        <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {syncWarning}
        </div>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryStat label="Required" value={paiseToInr(v.requiredPaise)} />
        <SummaryStat label="Collected" value={paiseToInr(v.collectedPaise)} accent="emerald" />
        <SummaryStat label="Refundable" value={paiseToInr(v.refundablePaise)} accent="strong" />
        <SummaryStat label="Deductions" value={paiseToInr(v.deductedPaise)} />
        <SummaryStat label="Refunded" value={paiseToInr(v.refundedPaise)} />
      </dl>
    </section>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald' | 'strong';
}) {
  const valueCls =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'strong'
        ? 'text-white font-semibold'
        : 'text-white';

  return (
    <div className="rounded-lg border border-white/10 bg-[#12161C] p-3">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold tabular-nums ${valueCls}`}>{value}</dd>
    </div>
  );
}
