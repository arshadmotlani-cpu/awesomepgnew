'use client';

import { useTransition } from 'react';
import { openInvoiceWhatsAppShareAction } from '@/app/(admin)/admin/invoices/actions';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';

const DEFAULT_CLASS =
  'inline-flex items-center gap-1 rounded-md border border-[#25D366]/40 bg-[#25D366]/10 px-2 py-1 text-[11px] font-medium text-[#25D366] hover:bg-[#25D366]/20 disabled:opacity-50';

type Props = {
  financialInvoiceId: string;
  disabled?: boolean;
  className?: string;
  label?: string;
};

/** Opens wa.me with the official invoice collection message and public /i/{token} URL. */
export function InvoiceWhatsAppShareButton({
  financialInvoiceId,
  disabled,
  className,
  label = 'WhatsApp',
}: Props) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set('invoiceId', financialInvoiceId);
      const result = await openInvoiceWhatsAppShareAction(fd);
      if (result.status === 'error') {
        window.alert(result.message);
        return;
      }
      if (result.status === 'ok' && result.whatsappUrl) {
        window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer');
      }
    });
  }

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={onClick}
      className={className ?? DEFAULT_CLASS}
      title="Share this invoice on WhatsApp"
    >
      <WhatsAppIcon className="h-3.5 w-3.5 shrink-0" />
      {pending ? 'Opening…' : label}
    </button>
  );
}
