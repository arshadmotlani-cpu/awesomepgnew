'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  approvePaymentProofWithAllocationAction,
  getBookingMoneyBalancesForReviewAction,
} from '@/app/(admin)/admin/payments/actions';
import { Badge } from '@/src/components/admin/Badge';
import type { PaymentAllocationSubmit } from '@/src/components/admin/operations/PaymentAllocationDialog';
import { PaymentProofRejectionDialog } from '@/src/components/admin/operations/PaymentProofRejectionDialog';
import { PaymentProofRejectionHistory } from '@/src/components/admin/operations/PaymentProofRejectionHistory';
import { PaymentScreenshotPreview } from '@/src/components/admin/PaymentScreenshotPreview';
import { PaymentAllocationEditor } from '@/src/components/admin/payment-review/PaymentAllocationEditor';
import type { BookingMoneyBalances } from '@/src/lib/billing/bookingMoneyBalances';
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

export function PaymentReviewWorkspace({ data }: { data: PaymentReviewWorkspaceData }) {
  const router = useRouter();
  const { item, breakdown, booking, rejectionHistory, driftWarning } = data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [allocation, setAllocation] = useState<PaymentAllocationSubmit | null>(null);
  const [allocationValid, setAllocationValid] = useState(false);
  const [balances, setBalances] = useState<BookingMoneyBalances | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(Boolean(item.bookingId));
  const [balancesError, setBalancesError] = useState<string | null>(null);

  const submittedPaise =
    item.submittedAmountPaise ?? item.receivedPaise ?? item.amountPaise ?? 0;

  useEffect(() => {
    if (!item.bookingId) {
      setBalancesLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setBalancesLoading(true);
      setBalancesError(null);
      try {
        const result = await getBookingMoneyBalancesForReviewAction(item.bookingId!);
        if (cancelled) return;
        if (!result.ok) {
          setBalancesError(result.message ?? 'Could not load balances.');
          return;
        }
        setBalances(result.balances);
      } catch (err) {
        if (!cancelled) {
          setBalancesError(err instanceof Error ? err.message : 'Could not load balances.');
        }
      } finally {
        if (!cancelled) setBalancesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.bookingId]);

  const handleAllocationChange = useCallback((next: PaymentAllocationSubmit) => {
    setAllocation(next);
  }, []);

  async function handleApprove() {
    if (!allocation || !allocationValid) {
      setError('Complete allocation before approving.');
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
          depositDueDate: allocation.depositDueDate,
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

      {driftWarning ? (
        <p className="mb-4 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {driftWarning}
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
            <h2 className="text-base font-semibold text-white">Payment summary</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <SummaryRow label="Total expected" value={paiseToInr(breakdown.totalExpectedPaise)} />
              <SummaryRow
                label="Resident paid"
                value={paiseToInr(breakdown.receivedPaise)}
                accent="emerald"
              />
              {breakdown.priorOutstandingDuePaise > 0 ? (
                <SummaryRow
                  label="Prior outstanding"
                  value={paiseToInr(breakdown.priorOutstandingDuePaise)}
                />
              ) : null}
              <SummaryRow label="Rent due" value={paiseToInr(breakdown.roomChargesDuePaise)} />
              <SummaryRow
                label="Deposit due"
                value={paiseToInr(breakdown.securityDepositDuePaise)}
              />
              {item.referenceNumber ? (
                <SummaryRow label="Payment reference" value={item.referenceNumber} />
              ) : null}
              <SummaryRow label="Payment method" value="UPI · Screenshot proof" />
            </dl>
          </section>

          {booking ? (
            <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
              <h2 className="text-base font-semibold text-white">Booking</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ContextRow label="Booking ID" value={booking.bookingCode} />
                <ContextRow label="Status" value={booking.bookingStatusLabel} />
                <ContextRow label="Stay type" value={booking.stayTypeLabel} />
                <ContextRow label="PG" value={booking.pgName} />
                <ContextRow label="Floor" value={booking.floorLabel} />
                <ContextRow label="Room" value={booking.roomNumber} />
                <ContextRow label="Bed" value={booking.bedCode} />
                <ContextRow label="Occupancy" value={booking.occupancyLabel} />
                <ContextRow label="Bed status" value={booking.bedStatus} />
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
                <ContextRow
                  label="Deposit received"
                  value={paiseToInr(booking.depositReceivedPaise)}
                />
                <ContextRow
                  label="Outstanding deposit"
                  value={paiseToInr(booking.depositOutstandingPaise)}
                />
                <ContextRow label="Check-in" value={booking.checkInDate} />
                <ContextRow label="Expected move-in" value={booking.expectedMoveInDate} />
                <ContextRow label="Duration" value={booking.durationLabel} />
                <ContextRow label="Billing cycle" value={booking.billingCycleLabel} />
                <ContextRow
                  label="Created"
                  value={booking.createdAt ? formatDate(booking.createdAt.slice(0, 10)) : null}
                />
              </dl>
              {booking.residentNotes ? (
                <p className="mt-4 rounded-lg border border-white/10 bg-[#121820] px-3 py-2 text-sm text-apg-silver">
                  <span className="font-medium text-white">Resident notes: </span>
                  {booking.residentNotes}
                </p>
              ) : null}
              {booking.adminNotes ? (
                <p className="mt-2 rounded-lg border border-white/10 bg-[#121820] px-3 py-2 text-sm text-apg-silver">
                  <span className="font-medium text-white">Admin notes: </span>
                  {booking.adminNotes}
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
                <ContextRow label="Pricing rule" value={item.bookingContext.pricingRule} />
                <ContextRow label="Calculation" value={item.bookingContext.rentCalculation} />
                {item.invoiceNumber ? (
                  <ContextRow label="Invoice" value={item.invoiceNumber} />
                ) : null}
                {item.billingMonth ? (
                  <ContextRow label="Billing month" value={item.billingMonth} />
                ) : null}
              </dl>
            </section>
          ) : null}

          <PaymentAllocationEditor
            item={item}
            submittedAmountPaise={submittedPaise}
            balances={balances}
            balancesLoading={balancesLoading}
            balancesError={balancesError}
            onChange={handleAllocationChange}
            onValidityChange={setAllocationValid}
          />

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
          <button
            type="button"
            disabled={busy || !allocationValid}
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

function SummaryRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald';
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd
        className={`mt-1 text-lg font-semibold tabular-nums ${
          accent === 'emerald' ? 'text-emerald-300' : 'text-white'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
