'use client';

import { useTransition } from 'react';
import { generatePaymentLinkAction } from '@/app/(admin)/admin/residents/paymentActions';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import {
  buildBillingWhatsAppUrl,
  type BillingWhatsAppInput,
} from '@/src/lib/billing/adminWhatsApp';

type Props = BillingWhatsAppInput & {
  residentId: string;
  pgId: string;
  disabled?: boolean;
  /** Override default compact WhatsApp button styling (e.g. primary action row). */
  className?: string;
  /** Override button label (default: WhatsApp). */
  label?: string;
};

/**
 * One tap: create (or reuse) a payment link, then open WhatsApp with the link in the message.
 */
export function BillingWhatsAppWithLinkButton({
  residentId,
  pgId,
  disabled,
  className,
  label = 'WhatsApp',
  ...billing
}: Props) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (billing.amountPaise <= 0) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('residentId', residentId);
      fd.set('pgId', pgId);
      fd.set('pgName', billing.pgName);
      fd.set('residentName', billing.customerName);
      fd.set('residentPhone', billing.phone);
      fd.set('amountPaise', String(billing.amountPaise));
      fd.set('purpose', billing.kind);
      if (billing.roomNumber) fd.set('roomNumber', billing.roomNumber);
      if (billing.dueDate) fd.set('dueDate', billing.dueDate);
      if (billing.isOverdue) fd.set('isOverdue', '1');

      const res = await generatePaymentLinkAction(fd);
      if (!res.ok) {
        window.alert(res.message);
        return;
      }

      const href =
        res.whatsappShareUrl ??
        buildBillingWhatsAppUrl({ ...billing, paymentLinkUrl: res.publicUrl });
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
      else window.alert('Could not open WhatsApp — check the resident phone number.');
    });
  }

  const defaultClass =
    'inline-flex items-center gap-1 rounded-md border border-[#25D366]/40 bg-[#25D366]/10 px-2 py-1 text-[11px] font-medium text-[#25D366] hover:bg-[#25D366]/20 disabled:opacity-50';

  return (
    <button
      type="button"
      disabled={disabled || pending || billing.amountPaise <= 0}
      onClick={onClick}
      className={className ?? defaultClass}
      title={`WhatsApp ${billing.customerName} with payment link`}
    >
      <WhatsAppIcon className="h-3.5 w-3.5 shrink-0" />
      {pending ? 'Opening…' : label}
    </button>
  );
}
