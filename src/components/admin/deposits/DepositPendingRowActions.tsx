'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { generatePaymentLinkAction } from '@/app/(admin)/admin/residents/paymentActions';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import { buildDepositCollectionWhatsAppUrl } from '@/src/lib/billing/depositCollectionWhatsApp';
import type { DepositCollectionStatus } from '@/src/lib/deposits/depositCollectionStatus';
import type { PgDepositResidentRow } from '@/src/services/pgDepositCollection';

const BTN =
  'inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] font-medium text-apg-silver hover:text-white disabled:opacity-50';

type Props = {
  pgId: string;
  pgName: string;
  resident: PgDepositResidentRow;
  depositStatus: DepositCollectionStatus;
};

export function DepositPendingRowActions({ pgId, pgName, resident, depositStatus }: Props) {
  const [pending, startTransition] = useTransition();
  const isMissing = depositStatus === 'requirement_missing';
  const canCollect = !isMissing && resident.outstandingPaise > 0;

  function generateDepositInvoice() {
    if (isMissing) return;
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

  function sendWhatsAppPaymentRequest(reminderOnly = false) {
    if (isMissing || resident.outstandingPaise <= 0) return;
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
          paymentLinkUrl: reminderOnly ? undefined : res.publicUrl,
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

      {isMissing ? (
        <Link href={`/admin/deposits/${resident.bookingId}`} className={`${BTN} border-amber-400/40 text-amber-200`}>
          Set deposit requirement
        </Link>
      ) : (
        <>
          <button
            type="button"
            disabled={pending || !canCollect}
            onClick={generateDepositInvoice}
            className={BTN}
          >
            {pending ? '…' : 'Generate deposit invoice'}
          </button>
          <button
            type="button"
            disabled={pending || !canCollect}
            onClick={() => sendWhatsAppPaymentRequest(true)}
            className={BTN}
          >
            {pending ? '…' : 'Send deposit reminder'}
          </button>
          <button
            type="button"
            disabled={pending || !canCollect}
            onClick={() => sendWhatsAppPaymentRequest(false)}
            className={`${BTN} border-[#25D366]/40 text-[#25D366]`}
          >
            <WhatsAppIcon className="h-3 w-3" />
            {pending ? '…' : 'Send WhatsApp payment request'}
          </button>
        </>
      )}
    </div>
  );
}
