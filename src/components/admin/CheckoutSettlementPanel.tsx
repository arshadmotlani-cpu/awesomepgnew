'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  approveCheckoutSettlementAction,
  markCheckoutRefundPaidAction,
  updateCheckoutSettlementFieldsAction,
  type CheckoutSettlementActionState,
} from '@/app/(admin)/admin/checkout-settlements/actions';
import { CheckoutSettlementElectricitySection } from '@/src/components/admin/CheckoutSettlementElectricitySection';
import { paiseToInr } from '@/src/lib/format';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

const idle: CheckoutSettlementActionState = { status: 'idle' };

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-2xl border border-white/10 bg-[#1A1F27] group"
    >
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold uppercase tracking-wide text-apg-orange marker:content-none">
        <span className="flex items-center justify-between">
          {title}
          <span className="text-xs font-normal text-apg-silver group-open:rotate-180 transition-transform">
            ▼
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
  const [refundState, refundAction, refundPending] = useActionState(
    markCheckoutRefundPaidAction,
    idle,
  );
  const [saveState, saveAction, savePending] = useActionState(
    updateCheckoutSettlementFieldsAction,
    idle,
  );

  useEffect(() => {
    if (
      approveState.status === 'ok' ||
      refundState.status === 'ok' ||
      saveState.status === 'ok'
    ) {
      router.refresh();
    }
  }, [approveState.status, refundState.status, saveState.status, router]);

  const locked = detail.amountsLocked;
  const canApprove = detail.status === 'awaiting_admin_review';
  const canMarkPaid = detail.status === 'refund_pending';
  const canEditElectricity =
    !locked &&
    (detail.status === 'awaiting_admin_review' ||
      detail.status === 'awaiting_resident_details');
  const preview = detail.preview;

  return (
    <div className="space-y-4">
      <Section title="Resident information">
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
            <dt className="text-apg-silver">PG · Room · Bed</dt>
            <dd className="text-white">
              {detail.pgName} · R{detail.roomNumber} · {detail.bedCode}
            </dd>
          </div>
          <div>
            <dt className="text-apg-silver">Move-in</dt>
            <dd className="text-white">{detail.moveInDate ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Vacating date</dt>
            <dd className="text-white">{detail.vacatingDate}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Notice given</dt>
            <dd className="text-white">
              {detail.noticeGivenDays} days (required {detail.noticeRequiredDays})
            </dd>
          </div>
          <div>
            <dt className="text-apg-silver">Shortfall</dt>
            <dd className="text-white">{detail.noticeShortfallDays} days</dd>
          </div>
        </dl>
      </Section>

      <Section title="Deposit wallet">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-apg-silver">Required</dt>
            <dd className="text-white">{paiseToInr(detail.depositRequiredPaise)}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Collected</dt>
            <dd className="text-white">{paiseToInr(detail.depositCollectedPaise)}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Deducted</dt>
            <dd className="text-white">{paiseToInr(detail.depositDeductedPaise)}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Refunded</dt>
            <dd className="text-white">{paiseToInr(detail.depositRefundedPaise)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-apg-silver">Current refundable balance</dt>
            <dd className="text-lg font-semibold text-emerald-300">
              {paiseToInr(detail.depositRefundablePaise)}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Notice deduction" defaultOpen={!locked}>
        <p className="text-xs text-apg-silver">
          Formula: monthly rent ÷ 30 × shortfall days ({detail.noticeShortfallDays} days)
        </p>
        {!locked && canApprove ? (
          <form action={saveAction} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="settlementId" value={detail.id} />
            <label className="text-sm">
              <span className="text-apg-silver">Notice deduction (₹)</span>
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
              {savePending ? 'Saving…' : 'Save amounts'}
            </button>
          </form>
        ) : (
          <p className="mt-2 text-lg font-semibold text-white">
            {paiseToInr(detail.noticeDeductionPaise)}
          </p>
        )}
      </Section>

      <Section title="Electricity settlement" defaultOpen={canEditElectricity}>
        <CheckoutSettlementElectricitySection detail={detail} editable={canEditElectricity} />
      </Section>

      <Section title="Refund information">
        {detail.payoutUpiId ? (
          <p className="text-sm text-white">
            UPI: <span className="font-mono">{detail.payoutUpiId}</span>
          </p>
        ) : null}
        {detail.payoutQrUrl ? (
          <a
            href={detail.payoutQrUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm font-semibold text-[#FF5A1F] hover:underline"
          >
            View QR code
          </a>
        ) : null}
        {!detail.payoutUpiId && !detail.payoutQrUrl ? (
          <p className="text-sm text-amber-200">Awaiting UPI ID or QR from resident.</p>
        ) : null}
      </Section>

      <Section title="Settlement preview">
        <div className="rounded-xl border border-white/10 bg-[#12161C] p-4 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-apg-silver">Deposit wallet</span>
            <span className="text-white">{paiseToInr(detail.depositRefundablePaise)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-apg-silver">Notice deduction</span>
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
            <span className="text-apg-silver">Other</span>
            <span className="text-rose-300">
              −{paiseToInr((preview.cleaningChargePaise ?? 0) + (preview.customChargePaise ?? 0))}
            </span>
          </div>
          <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-lg font-bold">
            <span className="text-white">Final refund</span>
            <span className="text-emerald-300">{paiseToInr(preview.finalRefundPaise)}</span>
          </div>
        </div>
      </Section>

      {canApprove ? (
        <form action={approveAction} className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5">
          <input type="hidden" name="settlementId" value={detail.id} />
          <input type="hidden" name="noticeDeductionInr" value={(detail.noticeDeductionPaise / 100).toFixed(2)} />
          <input type="hidden" name="electricityShareInr" value={((preview.electricityDeductFromDeposit ? preview.electricityDeductionPaise : 0) / 100).toFixed(2)} />
          <input type="hidden" name="damageChargeInr" value={(detail.damageChargePaise / 100).toFixed(2)} />
          <input type="hidden" name="cleaningChargeInr" value={(detail.cleaningChargePaise / 100).toFixed(2)} />
          <input type="hidden" name="customChargeInr" value={(detail.customChargePaise / 100).toFixed(2)} />
          <h3 className="text-sm font-semibold text-emerald-100">Approve settlement</h3>
          <p className="mt-1 text-xs text-emerald-200/90">
            Writes all deductions to the deposit ledger, completes vacating, frees the bed, and locks
            the final refund amount. Does not mark refund as paid.
          </p>
          <button
            type="submit"
            disabled={approvePending}
            className="mt-4 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {approvePending ? 'Approving…' : 'Approve settlement'}
          </button>
          {approveState.status === 'error' ? (
            <p className="mt-2 text-xs text-rose-300">{approveState.message}</p>
          ) : null}
          {approveState.status === 'ok' ? (
            <p className="mt-2 text-xs text-emerald-200">{approveState.message}</p>
          ) : null}
        </form>
      ) : null}

      {canMarkPaid ? (
        <form action={refundAction} className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-5 space-y-3">
          <input type="hidden" name="settlementId" value={detail.id} />
          <h3 className="text-sm font-semibold text-sky-100">Mark refund paid</h3>
          <label className="block text-sm">
            <span className="text-apg-silver">UPI reference / transaction number *</span>
            <input
              name="refundReference"
              required
              className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm">
            <span className="text-apg-silver">Method</span>
            <input
              name="refundMethod"
              placeholder="UPI / bank transfer"
              className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm">
            <span className="text-apg-silver">Notes</span>
            <input
              name="refundNotes"
              className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-white"
            />
          </label>
          <button
            type="submit"
            disabled={refundPending}
            className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {refundPending ? 'Recording…' : 'Mark refund paid'}
          </button>
          {refundState.status === 'error' ? (
            <p className="text-xs text-rose-300">{refundState.message}</p>
          ) : null}
        </form>
      ) : null}

      {detail.status === 'completed' ? (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Settlement completed
          {detail.refundReference ? ` · Ref: ${detail.refundReference}` : ''}
        </p>
      ) : null}
    </div>
  );
}
