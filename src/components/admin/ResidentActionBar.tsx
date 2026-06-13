'use client';

import { useState, useTransition } from 'react';
import { generatePaymentLinkAction } from '@/app/(admin)/admin/residents/paymentActions';
import { AdminBillingWhatsAppButton } from '@/src/components/admin/AdminBillingWhatsAppButton';
import { AdminKycStatusWithWhatsApp } from '@/src/components/admin/AdminKycWhatsAppButton';
import { RentUpdatedWhatsAppButton } from '@/src/components/admin/RentUpdatedWhatsAppButton';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { titleCase } from '@/src/lib/format';

const BTN =
  'inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-apg-silver hover:text-white';

type ResidentActionBarProps = {
  customerId: string;
  customerName: string;
  phone: string;
  kycStatus: 'pending' | 'approved' | 'rejected';
  pgId?: string;
  pgName?: string;
  roomNumber?: string;
  bookingId?: string;
  pendingRentPaise?: number;
  rentDueDate?: string;
  rentOverdue?: boolean;
  /** After rent save — show updated-rent WhatsApp with fresh payment link */
  rentUpdated?: { newAmountPaise: number; paymentLinkUrl: string };
};

export function ResidentActionBar(props: ResidentActionBarProps) {
  const [pending, startTransition] = useTransition();
  const [linkResult, setLinkResult] = useState<{
    publicUrl: string;
    whatsappShareUrl: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canBill = props.pgId && props.pgName && props.pendingRentPaise && props.pendingRentPaise > 0;

  function generateLink(rentUpdated?: boolean) {
    if (!props.pgId || !props.pgName) return;
    const amount = rentUpdated
      ? props.rentUpdated?.newAmountPaise
      : props.pendingRentPaise;
    if (!amount) return;

    startTransition(async () => {
      setError(null);
      const fd = new FormData();
      fd.set('residentId', props.customerId);
      fd.set('pgId', props.pgId!);
      fd.set('pgName', props.pgName!);
      fd.set('residentName', props.customerName);
      fd.set('residentPhone', props.phone);
      fd.set('amountPaise', String(amount));
      fd.set('purpose', 'rent');
      if (props.roomNumber) fd.set('roomNumber', props.roomNumber);
      if (props.rentDueDate) fd.set('dueDate', props.rentDueDate);
      if (props.rentOverdue) fd.set('isOverdue', '1');
      if (rentUpdated) fd.set('rentUpdated', '1');

      const res = await generatePaymentLinkAction(fd);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setLinkResult({ publicUrl: res.publicUrl, whatsappShareUrl: res.whatsappShareUrl });
    });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-apg-orange">
        Actions
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <AdminKycStatusWithWhatsApp
          kycStatus={props.kycStatus}
          phone={props.phone}
          customerName={props.customerName}
          badge={
            <span className={`${BTN} border-[#25D366]/40 bg-[#25D366]/10 text-[#25D366]`}>
              <WhatsAppIcon className="h-3.5 w-3.5" />
              KYC
            </span>
          }
        />

        {canBill ? (
          <AdminBillingWhatsAppButton
            kind="rent"
            customerName={props.customerName}
            phone={props.phone}
            pgName={props.pgName!}
            amountPaise={props.pendingRentPaise!}
            dueDate={props.rentDueDate ?? 'soon'}
            roomNumber={props.roomNumber}
            isOverdue={props.rentOverdue}
            paymentLinkUrl={linkResult?.publicUrl}
          />
        ) : null}

        {props.rentUpdated ? (
          <RentUpdatedWhatsAppButton
            customerName={props.customerName}
            phone={props.phone}
            pgName={props.pgName ?? 'your PG'}
            newAmountPaise={props.rentUpdated.newAmountPaise}
            paymentLinkUrl={props.rentUpdated.paymentLinkUrl}
          />
        ) : null}

        {canBill ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => generateLink(false)}
            className={`${BTN} hover:border-[#FF5A1F]/50 hover:text-[#FF5A1F]`}
          >
            {pending ? 'Generating…' : 'Payment link'}
          </button>
        ) : null}

        {props.bookingId ? (
          <a href={`/admin/bookings/${props.bookingId}`} className={BTN}>
            History →
          </a>
        ) : null}

        <a href={`/admin/panel?tab=audit`} className={BTN}>
          Audit log →
        </a>
      </div>

      {linkResult ? (
        <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          <p className="font-semibold">Payment link ready</p>
          <a
            href={linkResult.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block break-all underline"
          >
            {linkResult.publicUrl}
          </a>
          {linkResult.whatsappShareUrl ? (
            <a
              href={linkResult.whatsappShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[#25D366]"
            >
              <WhatsAppIcon className="h-3.5 w-3.5" />
              Send via WhatsApp
            </a>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

      {props.kycStatus !== 'approved' ? (
        <p className="mt-2 text-[11px] text-apg-silver">
          KYC: <Badge tone={toneForStatus(props.kycStatus)}>{titleCase(props.kycStatus)}</Badge>
        </p>
      ) : null}
    </div>
  );
}
