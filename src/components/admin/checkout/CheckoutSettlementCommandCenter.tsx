import { Badge } from '@/src/components/admin/Badge';
import { CheckoutSettlementEvidenceCard } from '@/src/components/admin/checkout/CheckoutSettlementEvidenceCard';
import {
  assessCheckoutSettlementReadiness,
  type CheckoutSettlementReadiness,
} from '@/src/lib/checkout/checkoutSettlementReadiness';
import { paiseToInr } from '@/src/lib/format';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

export function CheckoutSettlementCommandCenter({
  detail,
}: {
  detail: CheckoutSettlementDetail;
}) {
  const readiness = assessCheckoutSettlementReadiness(detail);
  const preview = detail.preview;

  return (
    <section className="mb-8 space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-white">{detail.customerName}</h2>
        <p className="mt-1 text-sm text-apg-silver">
          {readiness.stayTypeLabel} · {detail.bookingCode} · {detail.pgName} · Room{' '}
          {detail.roomNumber} · {detail.bedCode}
        </p>
        <p className="mt-1 text-xs text-apg-silver">
          Check-in {detail.moveInDate ?? '—'} → Checkout {detail.vacatingDate}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Deposit held" value={paiseToInr(detail.depositRefundablePaise)} />
        <Metric
          label="Electricity deduction"
          value={paiseToInr(preview.electricityDeductionPaise)}
        />
        <Metric label="Other deductions" value={paiseToInr(otherDeductions(preview))} />
        <Metric label="Final refund" value={paiseToInr(preview.finalRefundPaise)} accent />
      </dl>

      {!readiness.isFixedStay && preview.noticeDeductionPaise > 0 ? (
        <p className="text-sm text-amber-200">
          Notice fee {paiseToInr(preview.noticeDeductionPaise)} (monthly resident)
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <CheckoutSettlementEvidenceCard
          title="Meter photo"
          evidence={detail.meterPhotoEvidence}
          fallback={
            detail.electricityUseAverage
              ? 'Average billing selected'
              : detail.meterPhotoMissing
                ? 'Marked as missing'
                : 'Not uploaded'
          }
        />
        <CheckoutSettlementEvidenceCard
          title="Refund QR / UPI"
          evidence={detail.refundQrEvidence}
          fallback={detail.payoutUpiId?.trim() ? `UPI: ${detail.payoutUpiId}` : 'Not submitted'}
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Settlement readiness</h3>
          <Badge tone={readiness.ready ? 'emerald' : 'amber'}>
            {readiness.ready ? 'Ready to complete' : 'Steps incomplete'}
          </Badge>
        </div>
        <ul className="mt-3 space-y-2">
          {readiness.items.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm">
              <span className={item.ok ? 'text-emerald-300' : 'text-rose-300'}>
                {item.ok ? '✓' : '○'}
              </span>
              <span>
                <span className="font-medium text-white">{item.label}</span>
                <span className="block text-xs text-apg-silver">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd
        className={
          'mt-2 text-xl font-semibold tabular-nums ' +
          (accent ? 'text-emerald-300' : 'text-white')
        }
      >
        {value}
      </dd>
    </div>
  );
}

function otherDeductions(preview: CheckoutSettlementDetail['preview']) {
  return (
    preview.noticeDeductionPaise +
    (preview.damageChargePaise ?? 0) +
    (preview.cleaningChargePaise ?? 0) +
    (preview.customChargePaise ?? 0)
  );
}

export { assessCheckoutSettlementReadiness, type CheckoutSettlementReadiness };
