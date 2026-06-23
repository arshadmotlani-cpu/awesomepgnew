import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';
import { formatDate } from '@/src/lib/format';
import { vacatingStatusLabel } from '@/src/lib/residents/vacatingJourney';
import { residentTabHref } from '@/src/lib/accountNavigation';

export function ResidentHomeMoveOutStatus({
  vacatingStatus,
  checkoutStatus,
  vacatingDate,
}: {
  vacatingStatus: string | null;
  checkoutStatus: string | null;
  vacatingDate: string | null;
}) {
  if (!vacatingStatus && !checkoutStatus) return null;

  const chipStatus = checkoutStatus ?? vacatingStatus ?? 'pending';
  const label = vacatingStatusLabel(vacatingStatus as 'pending' | 'approved' | 'completed' | 'rejected' | null);

  let detail = 'Track each step on your move-out page.';
  if (vacatingStatus === 'pending') {
    detail = 'Your vacate request is with the office for approval.';
  } else if (vacatingStatus === 'approved' && vacatingDate) {
    detail = `Move-out date confirmed · ${formatDate(vacatingDate)}`;
  } else if (checkoutStatus === 'awaiting_resident_details') {
    detail = 'Submit your meter photo and UPI details for your deposit refund.';
  } else if (checkoutStatus === 'refund_pending' || checkoutStatus === 'awaiting_admin_review') {
    detail = 'Your refund is being processed.';
  } else if (checkoutStatus === 'refund_paid') {
    detail = 'Your deposit refund has been sent.';
  }

  return (
    <ApgCard tier="account" className="border-indigo-200/80 bg-indigo-50/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Move-out status</h2>
          <p className="mt-1 text-sm text-zinc-700">{detail}</p>
        </div>
        <StatusChip status={chipStatus} />
      </div>
      <Link
        href={residentTabHref('vacating')}
        className="mt-4 inline-block text-xs font-semibold text-indigo-700 hover:text-indigo-600"
      >
        Open move-out journey →
      </Link>
    </ApgCard>
  );
}
