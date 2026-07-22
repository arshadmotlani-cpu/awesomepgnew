'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { approvePaymentReviewVerificationAction } from '@/app/(admin)/admin/payments/actions';
import { Badge } from '@/src/components/admin/Badge';
import { PaymentProofRejectionDialog } from '@/src/components/admin/operations/PaymentProofRejectionDialog';
import { PaymentProofRejectionHistory } from '@/src/components/admin/operations/PaymentProofRejectionHistory';
import { PaymentScreenshotPreview } from '@/src/components/admin/PaymentScreenshotPreview';
import { paiseToInr, titleCase } from '@/src/lib/format';
import { paymentReviewWorkspaceHref } from '@/src/lib/operations/paymentReviewLinks';
import { buildPaymentReviewVerification } from '@/src/lib/operations/paymentReviewVerification';
import { adminPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import type { PaymentReviewWorkspaceData } from '@/src/services/paymentReviewWorkspace';

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

export function PaymentReviewWorkspace({ data }: { data: PaymentReviewWorkspaceData }) {
  const router = useRouter();
  const { item, booking, rejectionHistory } = data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);

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

  async function handleApprove() {
    setBusy(true);
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
    <div className="pb-20">
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
        <p className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
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

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0F1218]/90 backdrop-blur-md supports-[backdrop-filter]:bg-[#0F1218]/75">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <Link
            href="/admin/operations?filter=waiting_for_approval"
            className="rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-apg-silver transition hover:bg-white/5 hover:text-white"
          >
            Back to queue
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {item.canReject ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejectOpen(true)}
                className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
              >
                Reject
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleApprove()}
              className="min-w-[120px] rounded-lg bg-apg-orange px-5 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {busy ? 'Approving…' : 'Approve'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
