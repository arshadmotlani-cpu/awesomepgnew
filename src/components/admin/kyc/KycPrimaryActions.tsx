import Link from 'next/link';
import { moduleKycVerifyHref } from '@/src/lib/admin/navigation';
import type { KycSubmissionListRow } from '@/src/services/kyc';

const PRIMARY =
  'inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110';
const SECONDARY =
  'inline-flex items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5';

export function KycPrimaryActions({
  pendingRows,
  pendingCount,
}: {
  pendingRows: KycSubmissionListRow[];
  pendingCount: number;
}) {
  const firstPending = pendingRows[0];
  const actions: Array<{ key: string; href: string; label: string; primary?: boolean }> = [];

  if (firstPending) {
    actions.push({
      key: 'review-first',
      href: moduleKycVerifyHref(firstPending.id),
      label: `Review ${firstPending.customerName}`,
      primary: true,
    });
  }

  if (pendingCount > 0) {
    actions.push({
      key: 'pending-queue',
      href: '/admin/residents/kyc?tab=pending',
      label: pendingCount === 1 ? 'View waiting submission' : `View all ${pendingCount} waiting`,
      primary: !firstPending,
    });
  }

  actions.push({
    key: 'approved',
    href: '/admin/residents/kyc?tab=approved',
    label: 'Approved documents',
  });

  actions.push({
    key: 'residents',
    href: '/admin/residents',
    label: 'All residents',
  });

  const visible = actions.slice(0, 5);

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-base font-semibold text-white">What to do next</h2>
      <p className="mt-1 text-sm text-apg-silver">
        {pendingCount > 0
          ? 'Open each submission, check photos match the resident, then approve or ask them to re-upload.'
          : 'No one is waiting. Approved documents stay on file below for reference.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {visible.map((action) => (
          <Link
            key={action.key}
            href={action.href}
            className={action.primary ? PRIMARY : SECONDARY}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
