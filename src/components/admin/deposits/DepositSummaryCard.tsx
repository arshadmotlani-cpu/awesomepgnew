import { Badge } from '@/src/components/admin/Badge';
import { paiseToInr } from '@/src/lib/format';
import type { UnifiedDepositView } from '@/src/lib/deposits/unifiedDepositView';
import { sanitizeUnifiedDepositView } from '@/src/lib/deposits/unifiedDepositView';

function statusTone(status: string) {
  switch (status) {
    case 'collecting':
      return 'amber' as const;
    case 'held':
      return 'emerald' as const;
    case 'refund_pending':
      return 'sky' as const;
    case 'settled':
      return 'zinc' as const;
    default:
      return 'zinc' as const;
  }
}

export function DepositSummaryCard({
  view,
  invoiceStatus,
  syncWarning,
  isFrozen,
}: {
  view?: Partial<UnifiedDepositView> | null;
  invoiceStatus?: string | null;
  syncWarning?: string | null;
  isFrozen?: boolean;
}) {
  const v = sanitizeUnifiedDepositView(view);

  if (!view || !v.bookingId) {
    return null;
  }

  const statusLabel = isFrozen ? 'Settled · closed' : (invoiceStatus ?? 'Unknown');

  return (
    <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      {syncWarning ? (
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <p className="font-medium">Wallet may be out of sync</p>
          <p className="mt-0.5 text-xs text-amber-200/90">{syncWarning}</p>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryStat label="Required deposit" value={paiseToInr(v.requiredPaise)} />
        <SummaryStat label="Collected deposit" value={paiseToInr(v.collectedPaise)} accent="emerald" />
        <SummaryStat label="Refundable deposit" value={paiseToInr(v.refundablePaise)} accent="strong" />
        <div className="rounded-lg border border-white/10 bg-[#12161C] p-3">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">
            Deposit status
          </dt>
          <dd className="mt-2">
            <Badge tone={isFrozen ? 'zinc' : statusTone(v.invoiceStatus ?? '')}>{statusLabel}</Badge>
          </dd>
        </div>
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
