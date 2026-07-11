'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import type { MyBookingCardModel } from '@/src/lib/account/myBookingRowPresentation';
import type { PaymentProofRejectionRow } from '@/src/services/paymentProofRejectionService';
import { PaymentRejectionStatusPanel } from '@/src/components/customer/payments/PaymentRejectionStatusPanel';
import { duration, easing } from '@/src/lib/design-system/motion';
import { surface } from '@/src/lib/design-system/tokens';

function statusChipClasses(model: MyBookingCardModel, hasRejection: boolean): string {
  if (hasRejection) {
    return 'border-rose-400/40 bg-rose-500/20 text-rose-100';
  }
  if (model.status === 'pending_payment' || model.status === 'draft') {
    return 'border-amber-400/40 bg-amber-500/15 text-amber-100';
  }
  if (model.status === 'pending_approval' || model.status === 'confirmed') {
    return 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100';
  }
  if (model.status === 'cancelled' || model.status === 'superseded' || model.status === 'refunded') {
    return 'border-white/15 bg-white/5 text-apg-silver';
  }
  return 'border-[#FF5A1F]/40 bg-[#FF5A1F]/15 text-orange-100';
}

function rejectionAction(rejection: PaymentProofRejectionRow, bookingCode: string | null) {
  switch (rejection.entityType) {
    case 'rent_invoice':
      return {
        href: `/account/resident/pay-rent/${rejection.entityId}`,
        label: 'Upload New Screenshot',
      };
    case 'electricity_invoice':
      return {
        href: `/account/resident/pay-electricity/${rejection.entityId}`,
        label: 'Upload New Screenshot',
      };
    case 'payment_link':
      return {
        href: `/pay/${rejection.entityId}`,
        label: 'Upload New Screenshot',
      };
    case 'stay_extension':
      return {
        href: bookingCode ? `/booking/${encodeURIComponent(bookingCode)}` : '/account/bookings',
        label: 'Open booking',
      };
    case 'pg_payment_record':
    default:
      // Booking QR reject cancels the request — resident starts fresh.
      return {
        href: '/pgs',
        label: 'Book again',
      };
  }
}

export function ApplicationBookingCard({
  model,
  rejection = null,
}: {
  model: MyBookingCardModel;
  rejection?: PaymentProofRejectionRow | null;
}) {
  const reduceMotion = useReducedMotion();

  if (model.warnings.length > 0 && !model.isLinkable) {
    return (
      <li className={`${surface.residentGlassPadded}`}>
        <p className="text-sm font-semibold text-amber-100">Incomplete booking record</p>
        <p className="mt-1 text-sm text-apg-silver">
          This booking is missing required details and cannot be opened yet.
        </p>
        <ul className="mt-2 list-inside list-disc text-xs text-amber-200/90">
          {model.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </li>
    );
  }

  const codeLabel = model.bookingCode ?? model.id;
  const subtitleParts = [
    model.pgName,
    model.bedCountLabel,
    model.checkInLabel ? `Check-in ${model.checkInLabel}` : null,
  ].filter(Boolean);
  const hasRejection = Boolean(rejection);
  const action = rejection ? rejectionAction(rejection, model.bookingCode) : null;

  return (
    <li className={`${surface.residentGlassPadded} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {model.bookingHref && !hasRejection ? (
            <Link
              href={model.bookingHref}
              className="font-mono text-sm font-semibold text-white hover:text-[#FF5A1F]"
            >
              {codeLabel}
            </Link>
          ) : (
            <p className="font-mono text-sm font-semibold text-white">{codeLabel}</p>
          )}
          <p className="mt-1 text-sm text-apg-silver">{subtitleParts.join(' · ')}</p>
          <p className="text-xs text-apg-muted">
            {model.durationLabel} · {model.totalLabel}
          </p>
          {model.status === 'superseded' ? (
            <p className="mt-2 text-xs text-violet-200">Replaced by a newer confirmed booking.</p>
          ) : null}
        </div>
        <motion.span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusChipClasses(model, hasRejection)}`}
          initial={reduceMotion ? false : { scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: duration.quick, ease: easing.out }}
        >
          {hasRejection ? '❌ Rejected' : model.statusLabel}
        </motion.span>
      </div>

      {rejection && action ? (
        <PaymentRejectionStatusPanel
          reasonLabel={rejection.reasonLabel}
          residentMessage={rejection.residentMessage}
          rejectedAt={rejection.rejectedAt}
          actionHref={action.href}
          actionLabel={action.label}
          showTimeline
        />
      ) : model.bookingHref ? (
        <Link
          href={model.bookingHref}
          className="inline-flex min-h-[40px] items-center text-sm font-semibold text-[#FF5A1F] hover:brightness-110"
        >
          Open booking →
        </Link>
      ) : null}
    </li>
  );
}
