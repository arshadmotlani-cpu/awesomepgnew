'use client';

import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
import {
  approveCheckoutSettlementAction,
  updateCheckoutSettlementFieldsAction,
  type CheckoutSettlementActionState,
} from '@/app/(admin)/admin/checkout-settlements/actions';
import { CheckoutSettlementElectricitySection } from '@/src/components/admin/CheckoutSettlementElectricitySection';
import { assessCheckoutSettlementReadiness } from '@/src/lib/checkout/checkoutSettlementReadiness';
import { paiseToInr } from '@/src/lib/format';
import { VACATING_NOTICE_MIN_DAYS, VACATING_NOTICE_PENALTY_DAYS } from '@/src/services/billing';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

const idle: CheckoutSettlementActionState = { status: 'idle' };

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-white/10 bg-[#1A1F27]"
    >
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-white marker:content-none">
        <span className="flex items-center justify-between">
          {title}
          <span className="text-xs font-normal text-apg-silver group-open:rotate-180 transition-transform">
            ▾
          </span>
        </span>
      </summary>
      <div className="border-t border-white/10 px-5 py-4">{children}</div>
    </details>
  );
}

export function CheckoutSettlementPanel({ detail }: { detail: CheckoutSettlementDetail }) {
  const router = useRouter();
  const [approveState, approveAction, approvePending] = useActionState(
    approveCheckoutSettlementAction,
    idle,
  );
  const [saveState, saveAction, savePending] = useActionState(
    updateCheckoutSettlementFieldsAction,
    idle,
  );

  useEffect(() => {
    if (approveState.status === 'ok' || saveState.status === 'ok') {
      router.refresh();
    }
  }, [approveState.status, saveState.status, router]);

  const preview = detail.preview;
  const locked = detail.amountsLocked;
  const readiness = assessCheckoutSettlementReadiness(detail);
  const zeroRefund = preview.finalRefundPaise <= 0;
  const canApprove = readiness.ready && !locked;
  const canMarkPaid = detail.status === 'refund_pending' && !zeroRefund;
  const canEditElectricity =
    !locked &&
    (detail.status === 'awaiting_admin_review' || detail.status === 'awaiting_resident_details');

  return (
    <div className="space-y-4">
      <Section title="Resident details" defaultOpen={false}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-apg-silver">Name</dt>
            <dd className="font-medium text-white">{detail.customerName}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Phone</dt>
            <dd className="text-white">{detail.customerPhone}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Booking</dt>
            <dd className="font-mono text-white">{detail.bookingCode}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Bed</dt>
            <dd className="text-white">
              {detail.pgName} · R{detail.roomNumber} · {detail.bedCode}
            </dd>
          </div>
          <div>
            <dt className="text-apg-silver">Move-in</dt>
            <dd className="text-white">{detail.moveInDate ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Move-out date</dt>
            <dd className="text-white">{detail.vacatingDate}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Notice given</dt>
            <dd className="text-white">
              {detail.noticeGivenDays} days (needed {detail.noticeRequiredDays})
            </dd>
          </div>
          <div>
            <dt className="text-apg-silver">Days short</dt>
            <dd className="text-white">{detail.noticeShortfallDays} days</dd>
          </div>
        </dl>
      </Section>

      <Section title="Notice fee" defaultOpen={canApprove && !locked}>
        <p className="text-xs text-apg-silver">
          Short notice (&lt; {detail.noticeRequiredDays} days): fixed {VACATING_NOTICE_PENALTY_DAYS}-day
          rent fee ({detail.noticeShortfallDays} days short of required notice)
        </p>
        {!locked && canApprove ? (
          <form action={saveAction} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="settlementId" value={detail.id} />
            <label className="text-sm">
              <span className="text-apg-silver">Notice fee (₹)</span>
              <input
                name="noticeDeductionInr"
                type="number"
                min="0"
                step="0.01"
                defaultValue={(detail.noticeDeductionPaise / 100).toFixed(2)}
                className="apg-admin-field mt-1 block w-40 rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-white"
              />
            </label>
            <button
              type="submit"
              disabled={savePending}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5"
            >
              {savePending ? 'Saving…' : 'Save fee'}
            </button>
          </form>
        ) : (
          <p className="mt-2 text-lg font-semibold text-white">
            {paiseToInr(detail.noticeDeductionPaise)}
          </p>
        )}
      </Section>

      <Section title="Electricity" defaultOpen={canEditElectricity}>
        <CheckoutSettlementElectricitySection detail={detail} editable={canEditElectricity} />
      </Section>

      <Section title="Refund payment details" defaultOpen={canMarkPaid}>
        {detail.payoutUpiId ? (
          <p className="text-sm text-white">
            UPI: <span className="font-mono">{detail.payoutUpiId}</span>
          </p>
        ) : null}
        {detail.refundQrEvidence.fetchable && detail.refundQrEvidence.viewUrl ? (
          <a
            href={detail.refundQrEvidence.viewUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm font-semibold text-[#FF5A1F] hover:underline"
          >
            View QR code
          </a>
        ) : detail.payoutQrUrl && detail.refundQrEvidence.status === 'image_missing' ? (
          <p className="mt-2 text-sm text-rose-300">QR on file but image is missing — ask resident to re-upload.</p>
        ) : null}
        {!detail.payoutUpiId && !detail.payoutQrUrl ? (
          zeroRefund ? (
            <p className="text-sm text-emerald-200">
              No refund due — deposit fully applied to deductions. UPI details not required.
            </p>
          ) : (
            <p className="text-sm text-amber-200">Waiting for UPI ID or QR from resident.</p>
          )
        ) : null}
      </Section>

      <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
        <h3 className="text-sm font-semibold text-white">Refund breakdown</h3>
        <div className="mt-3 rounded-xl border border-white/10 bg-[#12161C] p-4 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-apg-silver">Deposit balance</span>
            <span className="text-white">{paiseToInr(detail.depositRefundablePaise)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-apg-silver">Notice fee</span>
            <span className="text-rose-300">−{paiseToInr(preview.noticeDeductionPaise)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-apg-silver">
              Electricity
              {!preview.electricityDeductFromDeposit && preview.electricitySharePaise > 0 ? (
                <span className="ml-1 text-xs text-amber-300">(not deducted)</span>
              ) : null}
            </span>
            <span className="text-rose-300">
              −{paiseToInr(preview.electricityDeductFromDeposit ? preview.electricityDeductionPaise : 0)}
              {!preview.electricityDeductFromDeposit && preview.electricitySharePaise > 0 ? (
                <span className="ml-2 text-xs font-normal text-apg-silver">
                  ({paiseToInr(preview.electricitySharePaise)} unpaid)
                </span>
              ) : null}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-apg-silver">Damage</span>
            <span className="text-rose-300">−{paiseToInr(preview.damageChargePaise ?? 0)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-apg-silver">Other charges</span>
            <span className="text-rose-300">
              −{paiseToInr((preview.cleaningChargePaise ?? 0) + (preview.customChargePaise ?? 0))}
            </span>
          </div>
          <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-lg font-bold">
            <span className="text-white">Final refund</span>
            <span className="text-emerald-300">{paiseToInr(preview.finalRefundPaise)}</span>
          </div>
        </div>
      </section>

      {canApprove ? (
        <form
          id="approve-settlement"
          action={approveAction}
          className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5"
        >
          <input type="hidden" name="settlementId" value={detail.id} />
          <input type="hidden" name="noticeDeductionInr" value={(detail.noticeDeductionPaise / 100).toFixed(2)} />
          <input type="hidden" name="damageChargeInr" value={(detail.damageChargePaise / 100).toFixed(2)} />
          <input type="hidden" name="cleaningChargeInr" value={(detail.cleaningChargePaise / 100).toFixed(2)} />
          <input type="hidden" name="customChargeInr" value={(detail.customChargePaise / 100).toFixed(2)} />
          <h3 className="text-sm font-semibold text-emerald-100">
            {zeroRefund ? 'Complete checkout (no refund due)' : 'Approve refund amount'}
          </h3>
          <p className="mt-1 text-xs text-emerald-200/90">
            {zeroRefund
              ? 'Records all deductions, completes move-out, frees the bed, and closes checkout — no payout step.'
              : 'Records all deductions, completes move-out, frees the bed, and locks the refund amount. Does not mark the refund as sent yet.'}
          </p>
          <button
            type="submit"
            disabled={approvePending || !readiness.ready}
            className="mt-4 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {approvePending
              ? 'Processing…'
              : zeroRefund
                ? 'Complete checkout'
                : 'Approve refund amount'}
          </button>
          {approveState.status === 'error' ? (
            <p className="mt-2 text-xs text-rose-300">{approveState.message}</p>
          ) : null}
          {!readiness.ready && !approvePending ? (
            <p className="mt-2 text-xs text-amber-200">
              Complete all steps above: {readiness.blockingReasons.join(' · ')}
            </p>
          ) : null}
          {approveState.status === 'ok' ? (
            <p className="mt-2 text-xs text-emerald-200">{approveState.message}</p>
          ) : null}
        </form>
      ) : null}

      {canMarkPaid ? (
        <div
          id="mark-refund-paid"
          className="space-y-3 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-5"
        >
          <h3 className="text-sm font-semibold text-sky-100">Send refund</h3>
          <p className="text-xs text-apg-silver">
            Approve the payout amount in the Refund Console — record UPI reference and mark the refund
            sent there.
          </p>
          <Link
            href={refundConsoleHref(detail.bookingId)}
            className="inline-flex rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
          >
            Open Refund Console →
          </Link>
        </div>
      ) : null}

      {detail.status === 'completed' ? (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Checkout complete
          {detail.refundReference ? ` · Ref: ${detail.refundReference}` : ''}
        </p>
      ) : null}
    </div>
  );
}
