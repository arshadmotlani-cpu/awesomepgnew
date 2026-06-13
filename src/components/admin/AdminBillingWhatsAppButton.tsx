'use client';

import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import {
  buildBillingWhatsAppUrl,
  type BillingWhatsAppInput,
} from '@/src/lib/billing/adminWhatsApp';

export function AdminBillingWhatsAppButton(props: BillingWhatsAppInput) {
  const href = buildBillingWhatsAppUrl(props);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-[#25D366]/40 bg-[#25D366]/10 px-2 py-1 text-[11px] font-medium text-[#25D366] hover:bg-[#25D366]/20"
      title={`WhatsApp ${props.customerName}`}
    >
      <WhatsAppIcon className="h-3.5 w-3.5" />
      WhatsApp
    </a>
  );
}
