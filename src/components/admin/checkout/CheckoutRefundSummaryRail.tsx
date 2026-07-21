'use client';

import Image from 'next/image';
import { useState } from 'react';
import { resolveBlobImageDisplaySrc } from '@/src/lib/storage/blobImageDisplay';
import { paiseToInr } from '@/src/lib/format';
import { formatBillingMonthLabel } from '@/src/lib/billing/formatBillingMonth';
import type { CheckoutSettlementImageEvidence } from '@/src/lib/checkout/checkoutSettlementImages';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

export type RefundSummaryOverrides = {
  electricityDeductionPaise?: number;
};

const NEUTRAL_BTN =
  'inline-flex min-h-[40px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.08]';

export function CheckoutRefundSummaryRail({
  detail,
  overrides,
  showPayment,
  qrSize = 'compact',
  className = '',
}: {
  detail: CheckoutSettlementDetail;
  overrides?: RefundSummaryOverrides;
  showPayment?: boolean;
  qrSize?: 'compact' | 'large';
  className?: string;
}) {
  const preview = detail.preview;
  const electricityDeduction =
    overrides?.electricityDeductionPaise ?? preview.electricityDeductionPaise;
  const damagePaise = preview.damageChargePaise ?? 0;
  const otherCharges =
    (preview.cleaningChargePaise ?? 0) + (preview.customChargePaise ?? 0);
  const finalRefund =
    overrides?.electricityDeductionPaise != null
      ? Math.max(
          0,
          detail.depositRefundablePaise -
            preview.noticeDeductionPaise -
            (preview.electricityDeductFromDeposit ? electricityDeduction : 0) -
            (preview.outstandingRentDeductionPaise ?? 0) -
            damagePaise -
            otherCharges,
        )
      : preview.finalRefundPaise;

  return (
    <aside
      className={
        'rounded-3xl bg-[#1A1F27]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.06] ' +
        className
      }
    >
      <p className="text-xs font-medium uppercase tracking-wider text-apg-silver">Refund summary</p>

      <dl className="mt-5 space-y-3 text-sm">
        <SummaryRow label="Deposit (escrow)" value={paiseToInr(detail.depositRefundablePaise)} />
        {detail.creditBalancePaise > 0 ? (
          <SummaryRow
            label="Credit balance"
            value={paiseToInr(detail.creditBalancePaise)}
            hint="Separate from deposit — may auto-apply to future invoices"
          />
        ) : null}
        <SummaryRow
          label="Notice fee"
          value={`−${paiseToInr(preview.noticeDeductionPaise)}`}
          muted
        />
        <SummaryRow
          label="Electricity"
          value={`−${paiseToInr(preview.electricityDeductFromDeposit ? electricityDeduction : 0)}`}
          muted
        />
        {preview.electricityDeductFromDeposit && electricityDeduction > 0 ? (
          <div className="rounded-2xl bg-white/[0.03] px-3 py-3 text-xs text-apg-silver">
            <p>
              This amount will automatically be credited toward this room&apos;s electricity bill
              {detail.roomElectricityLedger
                ? ` for ${formatBillingMonthLabel(detail.roomElectricityLedger.billingMonth)}`
                : ''}
              .
            </p>
            {detail.roomElectricityLedger ? (
              <dl className="mt-3 space-y-1.5">
                <div className="flex justify-between gap-3">
                  <dt>Room electricity collected</dt>
                  <dd className="font-medium text-white">
                    {paiseToInr(detail.roomElectricityLedger.collectedPaise)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Remaining</dt>
                  <dd className="font-medium text-white">
                    {paiseToInr(detail.roomElectricityLedger.remainingPaise)}
                  </dd>
                </div>
              </dl>
            ) : null}
          </div>
        ) : null}
        {preview.outstandingRentDeductionPaise > 0 ? (
          <SummaryRow
            label="Outstanding rent"
            value={`−${paiseToInr(preview.outstandingRentDeductionPaise)}`}
            muted
          />
        ) : null}
        <SummaryRow
          label="Damage"
          value={`−${paiseToInr(damagePaise)}`}
          muted
        />
        <SummaryRow label="Other charges" value={`−${paiseToInr(otherCharges)}`} muted />
      </dl>

      <div className="my-5 border-t border-white/[0.08]" />

      <div className="flex items-end justify-between gap-3">
        <p className="text-sm font-medium text-apg-silver">Final refund</p>
        <p className="text-3xl font-semibold tracking-tight text-white">{paiseToInr(finalRefund)}</p>
      </div>

      {showPayment ? (
        <PaymentDestination
          upiId={detail.payoutUpiId}
          evidence={detail.refundQrEvidence}
          customerName={detail.customerName}
          qrSize={qrSize}
        />
      ) : null}
    </aside>
  );
}

function SummaryRow({
  label,
  value,
  muted,
  hint,
}: {
  label: string;
  value: string;
  muted?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <dt className="text-apg-silver">{label}</dt>
        <dd className={muted ? 'font-medium text-white/80' : 'font-medium text-white'}>{value}</dd>
      </div>
      {hint ? <p className="mt-0.5 text-[10px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function PaymentDestination({
  upiId,
  evidence,
  customerName,
  qrSize = 'compact',
}: {
  upiId: string | null;
  evidence: CheckoutSettlementImageEvidence;
  customerName: string;
  qrSize?: 'compact' | 'large';
}) {
  const [copied, setCopied] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const displaySrc = evidence.viewUrl
    ? resolveBlobImageDisplaySrc(evidence.storedUrl, evidence.viewUrl)
    : null;
  const showQr = Boolean(displaySrc) && evidence.fetchable && !loadFailed;
  const trimmedUpi = upiId?.trim() ?? '';

  async function copyUpi() {
    if (!trimmedUpi) return;
    await navigator.clipboard.writeText(trimmedUpi);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function downloadQr() {
    if (!displaySrc) return;
    const res = await fetch(displaySrc);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${customerName.replace(/\s+/g, '-').toLowerCase()}-refund-qr.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-6 space-y-4 border-t border-white/[0.08] pt-6">
      <p className="text-xs font-medium uppercase tracking-wider text-apg-silver">
        Payment destination
      </p>

      {showQr && displaySrc ? (
        <div
          className={
            'relative mx-auto aspect-square w-full overflow-hidden rounded-2xl bg-black/30 ' +
            (qrSize === 'large' ? 'max-w-[280px]' : 'max-w-[200px]')
          }
        >
          <Image
            src={displaySrc}
            alt="Refund QR code"
            fill
            className="object-contain p-2"
            unoptimized
            onError={() => setLoadFailed(true)}
          />
        </div>
      ) : null}

      {trimmedUpi ? (
        <p className="text-center font-mono text-sm text-white">{trimmedUpi}</p>
      ) : !showQr ? (
        <p className="text-center text-sm text-apg-silver">No UPI or QR submitted yet.</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {trimmedUpi ? (
          <button type="button" onClick={() => void copyUpi()} className={NEUTRAL_BTN}>
            {copied ? 'Copied' : 'Copy UPI'}
          </button>
        ) : null}
        {showQr ? (
          <button type="button" onClick={() => void downloadQr()} className={NEUTRAL_BTN}>
            Download QR
          </button>
        ) : null}
      </div>
    </div>
  );
}
