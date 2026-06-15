'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { generatePaymentLinkAction } from '@/app/(admin)/admin/residents/paymentActions';
import { AdminBillingWhatsAppButton } from '@/src/components/admin/AdminBillingWhatsAppButton';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import { buildKycWhatsAppUrl, clientPublicSiteBaseUrl } from '@/src/lib/kyc/adminWhatsApp';

const BTN =
  'inline-flex items-center gap-0.5 rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-apg-silver hover:text-white';

export type FinancialRowActionsProps = {
  residentId: string;
  residentName: string;
  phone: string;
  pgId: string;
  pgName: string;
  amountPaise: number;
  purpose: 'rent' | 'electricity' | 'deposit';
  dueDate?: string;
  roomNumber?: string;
  isOverdue?: boolean;
  bookingId?: string;
  /** Show KYC WhatsApp instead of billing */
  kycOnly?: boolean;
};

export function FinancialRowActions(props: FinancialRowActionsProps) {
  const [pending, startTransition] = useTransition();
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kycHref =
    props.kycOnly &&
    buildKycWhatsAppUrl({
      phone: props.phone,
      customerName: props.residentName,
      baseUrl: clientPublicSiteBaseUrl(),
    });

  function generateLink() {
    startTransition(async () => {
      setError(null);
      const fd = new FormData();
      fd.set('residentId', props.residentId);
      fd.set('pgId', props.pgId);
      fd.set('pgName', props.pgName);
      fd.set('residentName', props.residentName);
      fd.set('residentPhone', props.phone);
      fd.set('amountPaise', String(props.amountPaise));
      fd.set('purpose', props.purpose);
      if (props.roomNumber) fd.set('roomNumber', props.roomNumber);
      if (props.dueDate) fd.set('dueDate', props.dueDate);
      if (props.isOverdue) fd.set('isOverdue', '1');

      const res = await generatePaymentLinkAction(fd);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setLinkUrl(res.publicUrl);
    });
  }

  if (props.kycOnly && kycHref) {
    return (
      <a
        href={kycHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`${BTN} border-[#25D366]/40 text-[#25D366]`}
        title="KYC WhatsApp"
      >
        <WhatsAppIcon className="h-3 w-3" />
        KYC
      </a>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1">
        {props.purpose === 'rent' || props.purpose === 'electricity' || props.purpose === 'deposit' ? (
          <AdminBillingWhatsAppButton
            kind={props.purpose}
            customerName={props.residentName}
            phone={props.phone}
            pgName={props.pgName}
            amountPaise={props.amountPaise}
            dueDate={props.dueDate ?? 'soon'}
            roomNumber={props.roomNumber}
            isOverdue={props.isOverdue}
            paymentLinkUrl={linkUrl ?? undefined}
          />
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={generateLink}
          className={`${BTN} hover:border-[#FF5A1F]/50 hover:text-[#FF5A1F]`}
        >
          {pending ? '…' : 'Link'}
        </button>
        {props.bookingId ? (
          <Link href={`/admin/bookings/${props.bookingId}`} className={BTN}>
            History
          </Link>
        ) : (
          <Link href={`/admin/residents/${props.residentId}`} className={BTN}>
            Profile
          </Link>
        )}
      </div>
      {linkUrl ? (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-[140px] truncate text-[10px] text-[#FF5A1F] hover:underline"
        >
          Pay link →
        </a>
      ) : null}
      {error ? <span className="text-[10px] text-rose-400">{error}</span> : null}
    </div>
  );
}
