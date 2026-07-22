import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { paiseToInr } from '@/src/lib/format';
import { adminPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import type { BookingPaymentVerificationAudit } from '@/src/lib/billing/bookingPaymentVerificationAudit';

export function BookingPaymentVerificationAuditSection({
  audit,
}: {
  audit: BookingPaymentVerificationAudit;
}) {
  const statusTone = audit.status === 'approved' ? 'emerald' : 'rose';
  const diffTone =
    audit.differencePaise <= 0 ? 'text-emerald-300' : 'text-amber-200';

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-sm font-semibold text-white">Payment verification</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <AuditRow label="Expected (Contract)" value={paiseToInr(audit.expectedContractPaise)} />
        <AuditRow
          label="Screenshot amount"
          value={paiseToInr(audit.screenshotAmountPaise)}
          valueClassName="text-emerald-300"
        />
        <AuditRow label="Difference" value={audit.differenceLabel} valueClassName={diffTone} />
        <div className="flex items-start justify-between gap-3 pt-1">
          <dt className="text-apg-silver">Status</dt>
          <dd>
            <Badge tone={statusTone}>{audit.status === 'approved' ? 'Approved' : 'Rejected'}</Badge>
          </dd>
        </div>
      </dl>
      {audit.hasScreenshot ? (
        <Link
          href={adminPaymentProofViewUrl('qr', audit.recordId)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex text-sm font-medium text-apg-orange hover:underline"
        >
          View uploaded screenshot →
        </Link>
      ) : (
        <p className="mt-4 text-xs text-apg-silver">Uploaded screenshot is no longer stored.</p>
      )}
    </div>
  );
}

function AuditRow({
  label,
  value,
  valueClassName = 'text-white',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-apg-silver">{label}</dt>
      <dd className={`shrink-0 text-right tabular-nums font-medium ${valueClassName}`}>{value}</dd>
    </div>
  );
}
