import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';
import { legacyResidentTabHref } from '@/src/lib/accountNavigation';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import {
  residentHomeMoveOutDetail,
  residentMoveOutChipLabel,
} from '@/src/lib/residents/vacatingPresentation';

export function ResidentHomeMoveOutStatus({
  vacatingStatus,
  checkoutStatus,
  vacatingDate,
  settlementWaterfall = null,
}: {
  vacatingStatus: string | null;
  checkoutStatus: string | null;
  vacatingDate: string | null;
  settlementWaterfall?: CheckoutSettlementWaterfall | null;
}) {
  if (!vacatingStatus && !checkoutStatus) return null;

  const detail = residentHomeMoveOutDetail({
    vacatingStatus,
    checkoutStatus,
    vacatingDate,
    waterfall: settlementWaterfall,
  });

  const chipLabel = residentMoveOutChipLabel({ vacatingStatus, checkoutStatus });

  return (
    <ApgCard tier="account" className="border-indigo-200/80 bg-indigo-50/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Move-out status</h2>
          <p className="mt-1 text-sm text-zinc-700">{detail}</p>
        </div>
        <StatusChip status={chipLabel} />
      </div>
      <Link
        href={legacyResidentTabHref('vacating')}
        className="mt-4 inline-block text-xs font-semibold text-indigo-700 hover:text-indigo-600"
      >
        Open move-out journey →
      </Link>
    </ApgCard>
  );
}
