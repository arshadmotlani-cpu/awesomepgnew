'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Eye, Phone, Zap } from 'lucide-react';
import { generateInvoicesAction, type ActionState } from '@/app/(admin)/admin/rent/actions';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';
import { formatDate, paiseToInr } from '@/src/lib/format';

const ICON_BTN =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 text-apg-silver transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';

const idle: ActionState = { status: 'idle' };

type Props = {
  bookingId: string;
  customerId: string;
  customerName: string;
  phone: string;
  billingMonth: string;
  issueDate: string;
  todayIso: string;
  expectedRentPaise: number;
  status: 'scheduled' | 'already_issued';
  canGenerate: boolean;
};

export function BillingUpcomingRowActions({
  bookingId,
  customerId,
  customerName,
  phone,
  billingMonth,
  issueDate,
  todayIso,
  expectedRentPaise,
  status,
  canGenerate,
}: Props) {
  const [, genAction, genPending] = useActionState(generateInvoicesAction, idle);

  const callHref = phone ? `tel:${phone.replace(/\s/g, '')}` : null;
  const showGenerate =
    canGenerate && status === 'scheduled' && issueDate <= todayIso;

  function onWhatsApp() {
    const digits = whatsAppPhoneDigits(phone);
    if (!digits) return;
    const text =
      `Hi ${customerName}, your rent bill of ${paiseToInr(expectedRentPaise)} ` +
      `is scheduled to generate on ${formatDate(issueDate)}. Please keep your payment ready.`;
    window.open(
      `https://wa.me/${digits}?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Link
        href={`/admin/residents/${customerId}`}
        className={ICON_BTN}
        title="View resident"
        aria-label="View resident"
      >
        <Eye className="h-3.5 w-3.5" />
      </Link>
      {phone ? (
        <button
          type="button"
          className={`${ICON_BTN} border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/10`}
          title="WhatsApp"
          aria-label="WhatsApp"
          disabled={!phone}
          onClick={onWhatsApp}
        >
          <WhatsAppIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {callHref ? (
        <a href={callHref} className={ICON_BTN} title="Call" aria-label="Call">
          <Phone className="h-3.5 w-3.5" />
        </a>
      ) : null}
      {showGenerate ? (
        <form action={genAction} className="inline-flex">
          <input type="hidden" name="billingMonth" value={billingMonth} />
          <input type="hidden" name="bookingIds" value={bookingId} />
          <input type="hidden" name="forceAll" value="1" />
          <button
            type="submit"
            className={`${ICON_BTN} border-[#FF5A1F]/30 text-[#FF5A1F] hover:bg-[#FF5A1F]/10`}
            title="Generate bill now"
            aria-label="Generate bill"
          disabled={genPending}
        >
          <Zap className="h-3.5 w-3.5" />
        </button>
        </form>
      ) : null}
    </div>
  );
}
