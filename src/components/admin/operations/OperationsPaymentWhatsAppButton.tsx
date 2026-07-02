'use client';

import { useTransition } from 'react';
import { openOperationsPaymentWhatsAppAction } from '@/app/(admin)/admin/operations/actions';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';

const BTN =
  'inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-2 text-xs font-semibold text-[#25D366] hover:bg-[#25D366]/20 disabled:opacity-50';

export function OperationsPaymentWhatsAppButton({ item }: { item: UnifiedOpsItem }) {
  const [pending, startTransition] = useTransition();

  if (!item.outstandingLines?.length || !item.customerId || !item.pgId || !item.residentPhone) {
    return null;
  }

  function onClick() {
    startTransition(async () => {
      const result = await openOperationsPaymentWhatsAppAction({
        residentId: item.customerId!,
        residentName: item.residentName,
        residentPhone: item.residentPhone!,
        pgId: item.pgId!,
        pgName: item.pgName ?? 'Awesome PG',
        roomNumber: item.roomNumber,
        lines: item.outstandingLines!,
      });
      if (!result.ok) {
        window.alert(result.message);
        return;
      }
      window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer');
    });
  }

  return (
    <button type="button" disabled={pending} onClick={onClick} className={BTN}>
      <WhatsAppIcon className="h-3.5 w-3.5 shrink-0" />
      {pending ? 'Opening…' : 'WhatsApp'}
    </button>
  );
}
