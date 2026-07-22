'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import {
  approvePaymentProofWithAllocationAction,
  savePendingPaymentProofCorrectionAction,
} from '@/app/(admin)/admin/payments/actions';
import { Badge } from '@/src/components/admin/Badge';
import type { PaymentAllocationSubmit } from '@/src/components/admin/operations/PaymentAllocationDialog';
import { PaymentProofRejectionDialog } from '@/src/components/admin/operations/PaymentProofRejectionDialog';
import { PaymentProofRejectionHistory } from '@/src/components/admin/operations/PaymentProofRejectionHistory';
import { PaymentScreenshotPreview } from '@/src/components/admin/PaymentScreenshotPreview';
import { PaymentAllocationEditor } from '@/src/components/admin/payment-review/PaymentAllocationEditor';
import type { MoneyBalanceSlice } from '@/src/lib/billing/bookingMoneyBalances';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { paymentReviewWorkspaceHref } from '@/src/lib/operations/paymentReviewLinks';
import { adminPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import type { PaymentReviewWorkspaceData } from '@/src/services/paymentReviewWorkspace';

function ContextRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function differenceLabel(differencePaise: number): { text: string; tone: string } {
  if (Math.abs(differencePaise) <= 100) {
    return { text: paiseToInr(0), tone: 'text-emerald-300' };
  }
  if (differencePaise < 0) {
    return { text: paiseToInr(differencePaise), tone: 'text-amber-200' };
  }
  return { text: `+${paiseToInr(differencePaise)}`, tone: 'text-rose-300' };
}

export function PaymentReviewWorkspace({ data }: { data: PaymentReviewWorkspaceData }) {
  const router = useRouter();
  const { item, breakdown, booking, rejectionHistory } = data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [allocation, setAllocation] = useState<PaymentAllocationSubmit | null>(null);
  const [allocationValid, setAllocationValid] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [correctionSaved, setCorrectionSaved] = useState(false);
  const [projected, setProjected] = useState<{
    rent: MoneyBalanceSlice;
    deposit: MoneyBalanceSlice;
  } | null>(null);

  const proofAmountPaise = breakdown.proofAmountPaise;
  const needsProofCorrection =
    item.kind === 'qr' &&
    allocation != null &&
    allocation.confirmedReceivedPaise !== proofAmountPaise;
  const diff = differenceLabel(breakdown.differencePaise);

  const handleAllocationChange = useCallback((next: PaymentAllocationSubmit) => {
    setAllocation(next);
    setCorrectionSaved(false);
    setProjected(null);
  }, []);

  async function handleSaveCorrection() {
    if (!allocation || !allocationValid) {
      setError('Open Edit allocation and assign every rupee before saving.');
      return;
    }
    setSaveBusy(true);
    setError(null);
    try {
      const result = await savePendingPaymentProofCorrectionAction(
        item.entityId,
        item.pgId,
        {
          confirmedReceivedPaise: allocation.confirmedReceivedPaise,
          rentAllocatedPaise: allocation.rentAllocatedPaise,
          depositAllocatedPaise: allocation.depositAllocatedPaise,
          electricityAllocatedPaise: allocation.electricityAllocatedPaise,
          otherAllocatedPaise: allocation.otherAllocatedPaise,
          allocationNotes: allocation.allocationNotes,
        },
      );
      if (!result.ok) {
        setError(result.message ?? 'Proof correction failed.');
        return;
      }
      setCorrectionSaved(true);
      setProjected(result.projected);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Proof correction failed.');
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleApprove() {
    if (!allocation || !allocationValid) {
      setError('Open Edit allocation and assign every rupee before approving.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await approvePaymentProofWithAllocationAction(
        item.kind,
        item.entityId,
        item.pgId,
        {
          confirmedReceivedPaise: allocation.confirmedReceivedPaise,
          rentAllocatedPaise: allocation.rentAllocatedPaise,
          depositAllocatedPaise: allocation.depositAllocatedPaise,
          electricityAllocatedPaise: allocation.electricityAllocatedPaise,
          otherAllocatedPaise: allocation.otherAllocatedPaise,
          allocationNotes: allocation.allocationNotes,
        },
        { approvalNotes: allocation.allocationNotes },
        data.reviewKey,
      );
      if (!result.ok) {
        setError(result.message ?? 'Approval failed.');
        return;
      }
      if (result.nextKey) {
        router.push(paymentReviewWorkspaceHref(result.nextKey));
        router.refresh();
        return;
      }
      router.push('/admin/operations?filter=waiting_for_approval');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setBusy(false);
    }
  }

  const kycTone =
    data.kycStatus === 'approved'
      ? 'emerald'
      : data.kycStatus === 'rejected'
        ? 'rose'
        : 'amber';

  return (
    <div className="pb-28">
      {rejectOpen ? (
        <PaymentProofRejectionDialog
          item={item}
          open
          onClose={() => setRejectOpen(false)}
          onRejected={({ nextKey }) => {
            setRejectOpen(false);
            if (nextKey) {
              router.push(paymentReviewWorkspaceHref(nextKey));
            } else {
              router.push('/admin/operations?filter=waiting_for_approval');
            }
            router.refresh();
          }}
        />
      ) : null}

      <header className="mb-6 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">
              Payment review
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white">{item.residentName}</h1>
            <p className="mt-1 text-sm text-apg-silver">
              {breakdown.bookingType}
              {booking ? ` · ${booking.bookingCode}` : null}
              {item.bookingCode && !booking ? ` · ${item.bookingCode}` : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.kycStatus ? (
              <Badge tone={kycTone}>KYC {titleCase(data.kycStatus)}</Badge>
            ) : null}
            <Badge tone="amber">{breakdown.statusLabel}</Badge>
            {item.customerId ? (
              <Link
                href={`/admin/residents/${item.customerId}`}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/5"
              >
                Resident profile
              </Link>
            ) : null}
            {booking ? (
              <Link
                href={`/admin/bookings/${booking.bookingId}/financial`}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/5"
              >
                Booking financials
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
            <h2 className="text-base font-semibold text-white">Payment under review</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <SummaryRow
                label="Screenshot amount"
                value={paiseToInr(proofAmountPaise)}
                accent="emerald"
              />
              <SummaryRow label="Expected amount" value={paiseToInr(breakdown.totalExpectedPaise)} />
              <SummaryRow label="Difference" value={diff.text} className={diff.tone} />
            </dl>
            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">
                Expected breakdown
              </p>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                {breakdown.roomChargesDuePaise > 0 ? (
                  <SummaryRow
                    label="Room rent"
                    value={paiseToInr(breakdown.roomChargesDuePaise)}
                    compact
                  />
                ) : null}
                {breakdown.securityDepositDuePaise > 0 ? (
                  <SummaryRow
                    label="Deposit required"
                    value={paiseToInr(breakdown.securityDepositDuePaise)}
                    compact
                  />
                ) : null}
                {breakdown.priorOutstandingDuePaise > 0 ? (
                  <SummaryRow
                    label="Prior outstanding"
                    value={paiseToInr(breakdown.priorOutstandingDuePaise)}
                    compact
                  />
                ) : null}
                {item.referenceNumber ? (
                  <SummaryRow label="Payment reference" value={item.referenceNumber} compact />
                ) : null}
              </dl>
            </div>
          </section>

          {booking ? (
            <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
              <h2 className="text-base font-semibold text-white">Booking information</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ContextRow label="Booking ID" value={booking.bookingCode} />
                <ContextRow label="Status" value={booking.bookingStatusLabel} />
                <ContextRow label="Stay type" value={booking.stayTypeLabel} />
                <ContextRow label="PG" value={booking.pgName} />
                <ContextRow label="Floor" value={booking.floorLabel} />
                <ContextRow label="Room" value={booking.roomNumber} />
                <ContextRow label="Bed" value={booking.bedCode} />
                <ContextRow label="Occupancy" value={booking.occupancyLabel} />
                <ContextRow
                  label="Monthly rent"
                  value={
                    booking.monthlyRentPaise != null
                      ? paiseToInr(booking.monthlyRentPaise)
                      : null
                  }
                />
                <ContextRow
                  label="Deposit required"
                  value={paiseToInr(booking.depositRequiredPaise)}
                />
                <ContextRow label="Check-in" value={booking.checkInDate} />
                <ContextRow label="Duration" value={booking.durationLabel} />
              </dl>
              {booking.residentNotes ? (
                <p className="mt-4 rounded-lg border border-white/10 bg-[#121820] px-3 py-2 text-sm text-apg-silver">
                  <span className="font-medium text-white">Resident notes: </span>
                  {booking.residentNotes}
                </p>
              ) : null}
            </section>
          ) : item.bookingContext ? (
            <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
              <h2 className="text-base font-semibold text-white">{item.bookingContext.bookingType}</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ContextRow label="Booking" value={item.bookingContext.bookingCode} />
                <ContextRow label="PG" value={item.bookingContext.pgName} />
                <ContextRow label="Room" value={item.bookingContext.roomNumber} />
                <ContextRow label="Bed" value={item.bookingContext.bedCode} />
                <ContextRow label="Period" value={item.bookingContext.duration} />
                {item.invoiceNumber ? (
                  <ContextRow label="Invoice" value={item.invoiceNumber} />
                ) : null}
              </dl>
            </section>
          ) : null}

          <PaymentAllocationEditor
            item={item}
            defaultProofAmountPaise={proofAmountPaise}
            onChange={handleAllocationChange}
            onValidityChange={setAllocationValid}
          />

          {needsProofCorrection || projected ? (
            <section className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-5">
              <h2 className="text-base font-semibold text-white">Historical proof recovery</h2>
              <p className="mt-2 text-sm text-apg-silver">
                This pending proof has a stored amount that does not match the verified screenshot.
                Set the allocation above, save the correction in place, then approve — no re-upload or
                rejection required.
              </p>
              {projected ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <BalancePreview title="Rent after approval" slice={projected.rent} />
                  <BalancePreview title="Deposit after approval" slice={projected.deposit} />
                </div>
              ) : null}
              {correctionSaved ? (
                <p className="mt-3 text-sm font-medium text-emerald-300">
                  Proof amount saved. Approve to apply rent and deposit to the booking.
                </p>
              ) : null}
            </section>
          ) : null}

          {rejectionHistory.length > 0 ? (
            <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
              <h2 className="text-base font-semibold text-white">Approval history</h2>
              <div className="mt-4">
                <PaymentProofRejectionHistory rows={rejectionHistory} />
              </div>
            </section>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <PaymentScreenshotPreview
            url={item.screenshotUrl}
            viewHref={adminPaymentProofViewUrl(item.kind, item.entityId)}
            alt={`${item.residentName} payment proof`}
            variant="review"
          />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0F1218]/95 px-4 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          {needsProofCorrection ? (
            <button
              type="button"
              disabled={busy || saveBusy || !allocationValid}
              onClick={() => void handleSaveCorrection()}
              className="min-w-[160px] rounded-lg border border-amber-400/40 bg-amber-500/15 px-5 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
            >
              {saveBusy ? 'Saving…' : 'Save proof correction'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || saveBusy || !allocationValid || (needsProofCorrection && !correctionSaved)}
            onClick={() => void handleApprove()}
            className="min-w-[140px] rounded-lg bg-apg-orange px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Approving…' : 'Approve'}
          </button>
          {item.canReject ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejectOpen(true)}
              className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-5 py-2.5 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
            >
              Reject
            </button>
          ) : null}
          <Link
            href="/admin/operations?filter=waiting_for_approval"
            className="ml-auto rounded-lg border border-white/10 px-4 py-2.5 text-sm text-apg-silver hover:bg-white/5"
          >
            Back to queue
          </Link>
        </div>
      </div>
    </div>
  );
}

function BalancePreview({ title, slice }: { title: string; slice: MoneyBalanceSlice }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#121820] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">{title}</p>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-apg-silver">Required</dt>
          <dd className="font-medium tabular-nums text-white">{paiseToInr(slice.requiredPaise)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-apg-silver">Received</dt>
          <dd className="font-medium tabular-nums text-emerald-300">
            {paiseToInr(slice.receivedPaise)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-apg-silver">Outstanding</dt>
          <dd className="font-semibold tabular-nums text-white">
            {paiseToInr(slice.outstandingPaise)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  accent,
  compact,
  className,
}: {
  label: string;
  value: string;
  accent?: 'emerald';
  compact?: boolean;
  className?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd
        className={`mt-1 tabular-nums ${
          compact ? 'text-sm font-medium' : 'text-lg font-semibold'
        } ${className ?? (accent === 'emerald' ? 'text-emerald-300' : 'text-white')}`}
      >
        {value}
      </dd>
    </div>
  );
}
