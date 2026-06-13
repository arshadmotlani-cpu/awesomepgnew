'use client';

import { buildBedAssignmentWhatsAppUrl } from '@/src/lib/billing/bedAssignmentWhatsApp';
import { openWhatsAppUrl } from '@/src/lib/kyc/adminWhatsApp';

export function BedAssignmentWhatsAppButton({
  customerName,
  phone,
  pgName,
  roomNumber,
  bedCode,
  className = 'inline-flex rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20',
}: {
  customerName: string;
  phone: string;
  pgName: string;
  roomNumber?: string;
  bedCode?: string;
  className?: string;
}) {
  const url = buildBedAssignmentWhatsAppUrl({
    customerName,
    phone,
    pgName,
    roomNumber,
    bedCode,
  });

  if (!url) return null;

  return (
    <button type="button" className={className} onClick={() => openWhatsAppUrl(url)}>
      Notify on WhatsApp
    </button>
  );
}
