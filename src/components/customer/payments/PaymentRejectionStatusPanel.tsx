'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { formatDateTime } from '@/src/lib/format';
import { duration, easing } from '@/src/lib/design-system/motion';
import { StatusTimeline, type TimelineStage } from '@/src/components/customer/design-system/StatusTimeline';

export type PaymentRejectionStatusPanelProps = {
  reasonLabel: string;
  residentMessage?: string | null;
  rejectedAt?: Date | string | null;
  /** Primary CTA — usually re-upload or start a new booking */
  actionHref: string;
  actionLabel?: string;
  /** Show full payment timeline (booking created → rejected → re-upload) */
  showTimeline?: boolean;
  className?: string;
};

const TIMELINE_STAGES: TimelineStage[] = [
  { id: 'created', label: 'Booking Created' },
  { id: 'uploaded', label: 'Payment Uploaded' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'reason', label: 'Reason' },
  { id: 'reupload', label: 'Upload New Screenshot' },
];

export function PaymentRejectionStatusPanel({
  reasonLabel,
  residentMessage,
  rejectedAt,
  actionHref,
  actionLabel = 'Upload New Screenshot',
  showTimeline = true,
  className = '',
}: PaymentRejectionStatusPanelProps) {
  const reduceMotion = useReducedMotion();
  const rejectedAtLabel = rejectedAt ? formatDateTime(rejectedAt) : null;

  return (
    <section
      className={`rounded-2xl border border-rose-400/35 bg-gradient-to-b from-rose-500/15 to-white/[0.03] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <motion.span
          className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-100"
          initial={reduceMotion ? false : { scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: duration.quick, ease: easing.out }}
        >
          <span aria-hidden>❌</span> Rejected
        </motion.span>
        <p className="text-sm font-semibold text-white">Payment Status</p>
      </div>

      {showTimeline ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-black/20 px-3 py-4">
          <StatusTimeline stages={TIMELINE_STAGES} activeIndex={4} orientation="horizontal" />
        </div>
      ) : null}

      <dl className="mt-5 space-y-3 text-sm">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
            Rejection reason
          </dt>
          <dd className="mt-1 font-medium text-white">{reasonLabel}</dd>
        </div>
        {residentMessage ? (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
              Admin message
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-apg-silver">{residentMessage}</dd>
          </div>
        ) : null}
        {rejectedAtLabel ? (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
              Rejection date
            </dt>
            <dd className="mt-1 text-white">{rejectedAtLabel}</dd>
          </div>
        ) : null}
      </dl>

      <Link
        href={actionHref}
        className="apg-glow-btn mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#FF5A1F] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
      >
        {actionLabel}
      </Link>
    </section>
  );
}
