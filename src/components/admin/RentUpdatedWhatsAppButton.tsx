'use client';

import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import { buildRentUpdatedWhatsAppUrl } from '@/src/lib/billing/adminWhatsApp';

export function RentUpdatedWhatsAppButton({
  customerName,
  phone,
  pgName,
  newAmountPaise,
  paymentLinkUrl,
}: {
  customerName: string;
  phone: string;
  pgName: string;
  newAmountPaise: number;
  paymentLinkUrl: string;
}) {
  const href = buildRentUpdatedWhatsAppUrl({
    customerName,
    phone,
    pgName,
    newAmountPaise,
    paymentLinkUrl,
  });
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 px-2.5 py-1.5 text-[11px] font-medium text-[#25D366] hover:bg-[#25D366]/20"
      title={`Notify ${customerName} about rent update`}
    >
      <WhatsAppIcon className="h-3.5 w-3.5" />
      Rent updated
    </a>
  );
}
