import Link from 'next/link';
import { customerPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { accountProfileHref } from '@/src/lib/accountNavigation';
import { formatDateTime } from '@/src/lib/format';

type Props = {
  bookingCode: string;
  paymentProofRecordId?: string | null;
  kycStatusLabel: string;
  documentsSubmitted: boolean;
  submittedAt?: Date | null;
};

const STEPS = [
  { id: 'bed', label: 'Bed selected' },
  { id: 'proof', label: 'Payment proof submitted' },
  { id: 'docs', label: 'Documents' },
  { id: 'review', label: 'Admin review' },
] as const;

export function AwaitingBookingApprovalPanel({
  bookingCode,
  paymentProofRecordId,
  kycStatusLabel,
  documentsSubmitted,
  submittedAt,
}: Props) {
  const docsDone = documentsSubmitted || kycStatusLabel === 'Verified';
  const stepDone = {
    bed: true,
    proof: Boolean(paymentProofRecordId),
    docs: docsDone,
    review: false,
  };

  return (
    <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
        Awaiting booking approval
      </p>
      <h2 className="mt-1 text-xl font-semibold text-zinc-900">
        Your request is with the office
      </h2>
      <p className="mt-2 text-sm text-zinc-700">
        We received your booking request. An admin will verify your payment and documents before
        your stay is confirmed. You will not see rent invoices or deposit ledger entries until
        then.
      </p>
      {submittedAt ? (
        <p className="mt-2 text-xs text-zinc-500">
          Submitted {formatDateTime(submittedAt)}
        </p>
      ) : null}

      <ol className="mt-5 space-y-3">
        {STEPS.map((step, index) => {
          const done = stepDone[step.id];
          const active = !done && (index === 0 || stepDone[STEPS[index - 1]!.id]);
          return (
            <li key={step.id} className="flex items-start gap-3 text-sm">
              <span
                className={
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
                  (done
                    ? 'bg-emerald-600 text-white'
                    : active
                      ? 'bg-amber-500 text-white'
                      : 'bg-zinc-200 text-zinc-600')
                }
              >
                {done ? '✓' : index + 1}
              </span>
              <div>
                <p className="font-medium text-zinc-900">{step.label}</p>
                {step.id === 'proof' && paymentProofRecordId ? (
                  <a
                    href={customerPaymentProofViewUrl('booking', paymentProofRecordId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    View uploaded payment proof →
                  </a>
                ) : null}
                {step.id === 'docs' ? (
                  <p className="text-xs text-zinc-600">
                    Status: {kycStatusLabel}
                    {!docsDone ? (
                      <>
                        {' · '}
                        <Link
                          href={accountProfileHref('identity', { booking: bookingCode })}
                          className="font-semibold text-indigo-600 hover:underline"
                        >
                          Upload documents
                        </Link>
                      </>
                    ) : null}
                  </p>
                ) : null}
                {step.id === 'review' ? (
                  <p className="text-xs text-zinc-600">
                    Usually within a few hours on business days.
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={`/booking/${bookingCode}/pay`}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          View payment submission
        </Link>
        <Link
          href="/account/bookings"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900"
        >
          All bookings
        </Link>
      </div>
    </section>
  );
}
