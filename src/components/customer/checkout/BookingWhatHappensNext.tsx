import Link from 'next/link';
import { STAY_CHECK_IN_TIME } from '@/src/lib/residents/stayBillingRules';

type Props = {
  bookingCode: string;
  checkInDate?: string | null;
  pgName?: string;
};

const STEPS = [
  {
    id: 'created',
    label: 'Booking created',
    detail: 'Your bed request is in our system.',
    status: 'done' as const,
    timeline: 'Just now',
  },
  {
    id: 'payment',
    label: 'Payment received',
    detail: 'We received your payment proof.',
    status: 'done' as const,
    timeline: 'Within minutes of upload',
  },
  {
    id: 'kyc',
    label: 'ID verification',
    detail: 'Upload Aadhaar and a selfie while you wait.',
    status: 'pending' as const,
    timeline: 'Usually 1–2 business days',
  },
  {
    id: 'assignment',
    label: 'Bed assignment',
    detail: 'PG team confirms your bed and move-in slot.',
    status: 'pending' as const,
    timeline: 'Usually within 24 hours of payment approval',
  },
  {
    id: 'movein',
    label: 'Move-in',
    detail: 'Check in at the PG on your move-in date.',
    status: 'pending' as const,
    timeline: 'On your selected check-in date',
  },
];

function StepIcon({ status }: { status: 'done' | 'pending' }) {
  if (status === 'done') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-sm text-emerald-300">
        ✓
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 text-sm text-apg-silver">
      ⏳
    </span>
  );
}

export function BookingWhatHappensNext({ bookingCode, checkInDate, pgName }: Props) {
  return (
    <section className="mt-6 rounded-2xl border border-white/10 apg-glass-light p-5 text-left">
      <h2 className="text-lg font-bold text-white">What happens next?</h2>
      <p className="mt-1 text-sm text-apg-silver">
        {pgName ? `${pgName} · ` : ''}
        {checkInDate
          ? `Move-in ${checkInDate} · ${STAY_CHECK_IN_TIME}`
          : `Check-in from ${STAY_CHECK_IN_TIME}`}
      </p>
      <ol className="mt-5 space-y-4">
        {STEPS.map((step) => (
          <li key={step.id} className="flex gap-3">
            <StepIcon status={step.status} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{step.label}</p>
              <p className="mt-0.5 text-xs text-apg-silver">{step.detail}</p>
              <p className="mt-1 text-[11px] font-medium text-apg-muted">{step.timeline}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/booking/${bookingCode}`}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-white/15 text-sm font-bold text-white hover:border-apg-orange/40"
        >
          View booking
        </Link>
        <Link
          href="/account/profile?section=identity"
          className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-apg-orange text-sm font-bold text-white"
        >
          Upload ID now
        </Link>
      </div>
    </section>
  );
}
