'use client';

import Link from 'next/link';
import { BillingWhatsAppWithLinkButton } from '@/src/components/admin/BillingWhatsAppWithLinkButton';
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
  const kycHref =
    props.kycOnly &&
    buildKycWhatsAppUrl({
      phone: props.phone,
      customerName: props.residentName,
      baseUrl: clientPublicSiteBaseUrl(),
    });

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
    <div className="flex flex-wrap justify-end gap-1">
      {props.purpose === 'rent' || props.purpose === 'electricity' || props.purpose === 'deposit' ? (
        <BillingWhatsAppWithLinkButton
          kind={props.purpose}
          residentId={props.residentId}
          pgId={props.pgId}
          customerName={props.residentName}
          phone={props.phone}
          pgName={props.pgName}
          amountPaise={props.amountPaise}
          dueDate={props.dueDate ?? 'soon'}
          roomNumber={props.roomNumber}
          isOverdue={props.isOverdue}
        />
      ) : null}
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
  );
}
