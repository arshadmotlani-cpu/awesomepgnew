import Link from 'next/link';
import { getCheckoutSettlementIdForVacating } from '@/src/services/checkoutSettlement';

export async function OpenCheckoutSettlementLink({
  vacatingRequestId,
}: {
  vacatingRequestId: string;
}) {
  const settlementId = await getCheckoutSettlementIdForVacating(vacatingRequestId);
  if (!settlementId) {
    return (
      <span className="rounded border border-amber-200 px-2 py-1 text-[10px] text-amber-700">
        Settlement pending
      </span>
    );
  }
  return (
    <Link
      href={`/admin/checkout-settlements/${settlementId}`}
      className="rounded bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-500"
    >
      Open settlement
    </Link>
  );
}
