import Link from 'next/link';
import { OPS_ORANGE } from '@/src/components/admin/residentOps/residentOpsUi';
import { RESOLVED_MESSAGE } from '@/src/lib/admin/notificationDeepLinkGuard';

export function NotificationActionResolved({
  message = RESOLVED_MESSAGE,
  operationsHref = '/admin/operations/residents',
}: {
  message?: string;
  operationsHref?: string;
}) {
  return (
    <div className="mb-8 flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-6 py-12 text-center">
      <p className="text-lg font-semibold text-emerald-100">{message}</p>
      <p className="mt-2 max-w-md text-sm text-emerald-200/80">
        The notification link is no longer active. Open Operations for current tasks.
      </p>
      <Link
        href={operationsHref}
        className="mt-6 inline-flex rounded-lg bg-[#FF5A1F] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
      >
        Back to Operations
      </Link>
      <Link
        href="/admin/notifications"
        className="mt-3 text-sm font-medium hover:underline"
        style={{ color: OPS_ORANGE }}
      >
        View all notifications
      </Link>
    </div>
  );
}
