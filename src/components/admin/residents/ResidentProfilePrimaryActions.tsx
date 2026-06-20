'use client';

import Link from 'next/link';
import { BillingWhatsAppWithLinkButton } from '@/src/components/admin/BillingWhatsAppWithLinkButton';
import { ExpressCollectionButton } from '@/src/components/admin/ExpressCollectionButton';
import type { ResidentBillingFormDefaults } from '@/src/services/residentBillingProfiles';

const PRIMARY =
  'inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110';
const SECONDARY =
  'inline-flex items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5';

type OutstandingBill = {
  kind: 'rent' | 'deposit' | 'electricity';
  amountPaise: number;
  dueDate?: string;
  isOverdue?: boolean;
};

type Props = {
  customerId: string;
  customerName: string;
  phone: string;
  kycStatus: 'pending' | 'approved' | 'rejected';
  pendingKycSubmissionId?: string | null;
  pgId?: string;
  pgName?: string;
  roomNumber?: string;
  bookingId?: string;
  bookingCode?: string;
  billingDefaults?: ResidentBillingFormDefaults | null;
  outstanding?: OutstandingBill | null;
  totalOutstandingPaise?: number;
  expressCollectionDefaultOpen?: boolean;
};

function kycReviewHref(customerId: string, submissionId?: string | null) {
  if (submissionId) return `/admin/residents/kyc/${submissionId}`;
  return `/admin/kyc?customer=${customerId}`;
}

export function ResidentProfilePrimaryActions({
  customerId,
  customerName,
  phone,
  kycStatus,
  pendingKycSubmissionId,
  pgId,
  pgName,
  roomNumber,
  bookingId,
  bookingCode,
  billingDefaults,
  outstanding,
  totalOutstandingPaise = 0,
  expressCollectionDefaultOpen,
}: Props) {
  const canBill = Boolean(pgId && pgName && bookingId);
  const needsKycReview = kycStatus === 'pending' || Boolean(pendingKycSubmissionId);

  type ActionItem =
    | { key: string; kind: 'link'; href: string; label: string; primary?: boolean }
    | { key: string; kind: 'anchor'; href: string; label: string; primary?: boolean }
    | { key: string; kind: 'whatsapp'; label: string; primary?: boolean }
    | { key: string; kind: 'express'; label: string; primary?: boolean };

  const candidates: ActionItem[] = [];

  if (canBill && outstanding && outstanding.amountPaise > 0) {
    candidates.push({ key: 'payment-request', kind: 'whatsapp', label: 'Send payment request', primary: true });
  }

  if (canBill) {
    candidates.push({
      key: 'record-payment',
      kind: 'express',
      label: 'Record payment received',
      primary: totalOutstandingPaise <= 0,
    });
  }

  if (needsKycReview) {
    candidates.push({
      key: 'kyc',
      kind: 'link',
      href: kycReviewHref(customerId, pendingKycSubmissionId),
      label: 'Review identity documents',
      primary: true,
    });
  }

  if (canBill) {
    candidates.push({
      key: 'deposit',
      kind: 'link',
      href: `/admin/deposits/${bookingId}`,
      label: 'Open security deposit',
    });
    candidates.push({
      key: 'change-bed',
      kind: 'anchor',
      href: '#edit-tenancy',
      label: 'Change bed or room',
    });
    candidates.push({
      key: 'booking',
      kind: 'link',
      href: `/admin/bookings/${bookingId}`,
      label: bookingCode ? `View booking ${bookingCode}` : 'View booking',
    });
    candidates.push({
      key: 'request-vacate',
      kind: 'link',
      href: `/admin/pgs/${pgId}/map`,
      label: 'Request vacate',
    });
    candidates.push({
      key: 'bed-map',
      kind: 'link',
      href: `/admin/pgs/${pgId}/map`,
      label: 'PG bed map',
    });
  } else if (needsKycReview) {
    candidates.push({
      key: 'assign',
      kind: 'anchor',
      href: '#assign-bed',
      label: 'Assign to a bed',
      primary: true,
    });
  }

  const seen = new Set<string>();
  const actions = candidates.filter((a) => {
    if (seen.has(a.key)) return false;
    seen.add(a.key);
    return true;
  });

  const visible = actions.slice(0, 5);

  if (visible.length === 0) return null;

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-sm font-semibold text-white">What to do next</h2>
      <p className="mt-1 text-xs text-apg-silver">
        {totalOutstandingPaise > 0
          ? 'This resident has an outstanding balance. Start with a payment request or record cash already received.'
          : needsKycReview
            ? 'Identity review is required before bed assignment.'
            : canBill
              ? 'Manage this stay, billing, and bed from here.'
              : 'Assign a bed once identity is approved.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {visible.map((action) => {
          const className = action.primary ? PRIMARY : SECONDARY;

          if (action.kind === 'whatsapp' && outstanding && canBill) {
            return (
              <BillingWhatsAppWithLinkButton
                key={action.key}
                kind={outstanding.kind}
                residentId={customerId}
                pgId={pgId!}
                customerName={customerName}
                phone={phone}
                pgName={pgName!}
                amountPaise={outstanding.amountPaise}
                dueDate={outstanding.dueDate ?? 'soon'}
                roomNumber={roomNumber}
                isOverdue={outstanding.isOverdue}
                className={className}
                label={action.label}
              />
            );
          }

          if (action.kind === 'express' && canBill) {
            return (
              <ExpressCollectionButton
                key={action.key}
                customerId={customerId}
                bookingId={bookingId}
                customerName={customerName}
                billingDefaults={billingDefaults}
                defaultOpen={expressCollectionDefaultOpen}
                triggerClassName={className}
                triggerLabel={action.label}
              />
            );
          }

          if (action.kind === 'link') {
            return (
              <Link key={action.key} href={action.href} className={className}>
                {action.label}
              </Link>
            );
          }

          if (action.kind === 'anchor') {
            return (
              <a key={action.key} href={action.href} className={className}>
                {action.label}
              </a>
            );
          }

          return null;
        })}
      </div>
    </section>
  );
}
