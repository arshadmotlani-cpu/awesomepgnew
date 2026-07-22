'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { approvePaymentReviewVerificationAction } from '@/app/(admin)/admin/payments/actions';
import { Badge } from '@/src/components/admin/Badge';
import { useOperationsActionToast } from '@/src/components/admin/operations/OperationsActionToast';
import { PaymentProofRejectionDialog } from '@/src/components/admin/operations/PaymentProofRejectionDialog';
import { PaymentProofRejectionHistory } from '@/src/components/admin/operations/PaymentProofRejectionHistory';
import { PaymentScreenshotPreview } from '@/src/components/admin/PaymentScreenshotPreview';
import { paiseToInr, titleCase } from '@/src/lib/format';
import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';
import { paymentReviewWorkspaceHref } from '@/src/lib/operations/paymentReviewLinks';
import { buildPaymentReviewVerification } from '@/src/lib/operations/paymentReviewVerification';
import { adminPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import type { PaymentReviewWorkspaceData } from '@/src/services/paymentReviewWorkspace';

import { stashOperationsApprovedToast } from '@/src/lib/operations/operationsActionToastFlash';

function differenceDisplay(differencePaise: number, tone: 'exact' | 'short' | 'excess'): {
  text: string;
  className: string;
} {
  if (tone === 'exact') {
    return { text: paiseToInr(0), className: 'text-emerald-300' };
  }
  if (tone === 'short') {
    return { text: paiseToInr(Math.abs(differencePaise)), className: 'text-amber-200' };
  }
  return { text: paiseToInr(Math.abs(differencePaise)), className: 'text-rose-300' };
}

function FieldRow({
  label,
  value,
  emphasize,
  className,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-sm text-apg-silver">{label}</dt>
      <dd
        className={`shrink-0 text-right tabular-nums ${
          emphasize ? 'text-base font-semibold' : 'text-sm font-medium'
        } ${className ?? 'text-white'}`}
      >
        {value}
      </dd>
    </div>
  );
}

function ApproveSpinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
      aria-hidden
    />
  );
}

export function PaymentReviewWorkspace({ data }: { data: PaymentReviewWorkspaceData }) {
  const router = useRouter();
  const { item, booking, rejectionHistory } = data;
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const { showToast, toastNode } = useOperationsActionToast();

  const verification = buildPaymentReviewVerification(
    item,
    booking
      ? {
          monthlyRentPaise: booking.monthlyRentPaise,
          depositRequiredPaise: booking.depositRequiredPaise,
        }
      : null,
  );
  const diff = differenceDisplay(verification.differencePaise, verification.differenceTone);
  const actionsDisabled = busy || approved;

  async function handleApprove() {
    setBusy(true);
    setApproved(false);
    setError(null);
    try {
      const result = await approvePaymentReviewVerificationAction(
        item.kind,
        item.entityId,
        item.pgId,
        undefined,
        data.reviewKey,
      );
      if (!result.ok) {
        setError(result.message ?? 'Approval failed.');
        setBusy(false);
        return;
      }

      const successMessage = 'Payment approved successfully.';
      setApproved(true);
      showToast(successMessage, 'success');

      stashOperationsApprovedToast(successMessage);

      const redirectTo = operationsFilterHref('waiting_for_approval');

      window.setTimeout(() => {
        router.push(redirectTo);
        router.refresh();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
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
    <div className="relative flex min-h-0 flex-col">
      {toastNode}

      {(busy || approved) && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-[#0B0F14]/75 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-busy={busy && !approved}
        >
          <div className="mx-4 max-w-sm rounded-2xl border border-white/10 bg-[#1A1F27] px-6 py-5 text-center shadow-2xl">
            {approved ? (
              <>
                <p className="text-base font-semibold text-emerald-200">Payment approved successfully.</p>
                <p className="mt-2 text-sm text-apg-silver">Returning to operations queue…</p>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-10 w-10 items-center justify-center">
                  <ApproveSpinner />
                </div>
                <p className="mt-3 text-sm font-medium text-white">Approving payment…</p>
              </>
            )}
          </div>
        </div>
      )}

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
              router.push(operationsFilterHref('waiting_for_approval'));
            }
            router.refresh();
          }}
        />
      ) : null}

      <div className="flex-1 space-y-6 pb-4">
        <header className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">
                Payment review
              </p>
              <h1 className="mt-1 text-xl font-semibold text-white">{item.residentName}</h1>
              <p className="mt-1 text-sm text-apg-silver">
                {item.bookingContext?.bookingType ?? item.paymentTypeLabel}
                {booking ? ` · ${booking.bookingCode}` : null}
                {item.bookingCode && !booking ? ` · ${item.bookingCode}` : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.kycStatus ? (
                <Badge tone={kycTone}>KYC {titleCase(data.kycStatus)}</Badge>
              ) : null}
              <Badge tone="amber">Awaiting review</Badge>
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
          <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
          <div className="space-y-6">
            {booking || verification.monthlyRentPaise > 0 || verification.depositRequiredPaise > 0 ? (
              <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
                <h2 className="text-base font-semibold text-white">Booking</h2>
                <dl className="mt-4 space-y-3">
                  {booking?.bookingCode ? (
                    <FieldRow label="Booking" value={booking.bookingCode} />
                  ) : null}
                  <FieldRow
                    label="Monthly rent"
                    value={paiseToInr(verification.monthlyRentPaise)}
                  />
                  <FieldRow
                    label="Required deposit"
                    value={paiseToInr(verification.depositRequiredPaise)}
                  />
                </dl>
              </section>
            ) : null}

            <section
              className={`rounded-2xl border p-5 ${
                verification.differenceTone === 'exact'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-rose-400/30 bg-rose-500/5'
              }`}
            >
              <h2 className="text-base font-semibold text-white">Verification</h2>
              <dl className="mt-4 space-y-3">
                <FieldRow
                  label="Expected"
                  value={paiseToInr(verification.expectedPaymentPaise)}
                  emphasize
                />
                <FieldRow
                  label="Screenshot amount"
                  value={paiseToInr(verification.screenshotAmountPaise)}
                  emphasize
                  className="text-emerald-300"
                />
                <FieldRow label="Difference" value={diff.text} emphasize className={diff.className} />
              </dl>
              <p className="mt-4 text-xs text-apg-silver">
                Approve confirms the booking using contract rent and deposit values. The screenshot
                is verification only.
              </p>
            </section>

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
      </div>

      <footer className="sticky bottom-0 z-10 mt-2 shrink-0 rounded-2xl border border-white/10 bg-[#1A1F27]/95 shadow-[0_-12px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-2.5 sm:px-5">
          <Link
            href={operationsFilterHref('waiting_for_approval')}
            aria-disabled={actionsDisabled}
            className={`rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-apg-silver transition hover:bg-white/5 hover:text-white ${
              actionsDisabled ? 'pointer-events-none opacity-50' : ''
            }`}
            onClick={(e) => {
              if (actionsDisabled) e.preventDefault();
            }}
          >
            Back to queue
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {item.canReject ? (
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => setRejectOpen(true)}
                className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reject
              </button>
            ) : null}
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => void handleApprove()}
              className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-lg bg-apg-orange px-5 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && !approved ? (
                <>
                  <ApproveSpinner />
                  Approving…
                </>
              ) : (
                'Approve'
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
