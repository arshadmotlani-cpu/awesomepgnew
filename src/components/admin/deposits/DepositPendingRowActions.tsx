'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { generatePaymentLinkAction } from '@/app/(admin)/admin/residents/paymentActions';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import { buildDepositCollectionWhatsAppUrl } from '@/src/lib/billing/depositCollectionWhatsApp';
import type { PgDepositResidentRow } from '@/src/services/pgDepositCollection';

const BTN =
  'inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] font-medium text-apg-silver hover:text-white disabled:opacity-50';

type Props = {
  pgId: string;
  pgName: string;
  resident: PgDepositResidentRow;
};

export function DepositPendingRowActions({ pgId, pgName, resident }: Props) {
  const [pending, startTransition] = useTransition();

  function createInvoice() {
    if (resident.outstandingPaise <= 0) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('residentId', resident.customerId);
      fd.set('pgId', pgId);
      fd.set('pgName', pgName);
      fd.set('residentName', resident.customerName);
      fd.set('residentPhone', resident.phone);
      fd.set('amountPaise', String(resident.outstandingPaise));
      fd.set('purpose', 'deposit');
      fd.set('roomNumber', resident.roomNumber);

      const res = await generatePaymentLinkAction(fd);
      if (!res.ok) {
        window.alert(res.message);
        return;
      }
      window.open(res.publicUrl, '_blank', 'noopener,noreferrer');
    });
  }

  function sendWhatsAppReminder() {
    if (resident.outstandingPaise <= 0) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('residentId', resident.customerId);
      fd.set('pgId', pgId);
      fd.set('pgName', pgName);
      fd.set('residentName', resident.customerName);
      fd.set('residentPhone', resident.phone);
      fd.set('amountPaise', String(resident.outstandingPaise));
      fd.set('purpose', 'deposit');
      fd.set('roomNumber', resident.roomNumber);

      const res = await generatePaymentLinkAction(fd);
      if (!res.ok) {
        window.alert(res.message);
        return;
      }

      const href =
        res.whatsappShareUrl ??
        buildDepositCollectionWhatsAppUrl({
          residentName: resident.customerName,
          phone: resident.phone,
          pgName,
          roomNumber: resident.roomNumber,
          bedCode: resident.bedCode,
          depositDuePaise: resident.outstandingPaise,
          paymentLinkUrl: res.publicUrl,
        });

      if (href) window.open(href, '_blank', 'noopener,noreferrer');
      else window.alert('Could not open WhatsApp — check the resident phone number.');
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Link href={`/admin/residents/${resident.customerId}`} className={BTN}>
        View resident
      </Link>
      <button type="button" disabled={pending || resident.outstandingPaise <= 0} onClick={createInvoice} className={BTN}>
        {pending ? '…' : 'Create deposit invoice'}
      </button>
      <button
        type="button"
        disabled={pending || resident.outstandingPaise <= 0}
        onClick={sendWhatsAppReminder}
        className={`${BTN} border-[#25D366]/40 text-[#25D366]`}
      >
        <WhatsAppIcon className="h-3 w-3" />
        {pending ? '…' : 'Send WhatsApp reminder'}
      </button>
    </div>
  );
}
