import { RefundConsoleWorkspace } from '@/src/components/admin/refunds/RefundConsoleWorkspace';
import { requireAdminPermission, requireAdminSession } from '@/src/lib/auth/guards';
import { assertAdminBookingAccess } from '@/src/lib/auth/pgAccess';
import { toRefundConsoleWorkspaceDTO } from '@/src/lib/refund/refundConsoleDto';
import { getRefundConsoleWorkspace } from '@/src/services/refundConsole';
import styles from './refunds.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Refund of Deposit · Admin',
  description: 'Deposit refund payout workspace.',
};

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string; customer?: string }>;
}) {
  const session = await requireAdminSession('/admin/refunds');
  await requireAdminPermission('deposits:write');

  const sp = await searchParams;
  const bookingId = sp.booking?.trim() ?? '';
  const customerId = sp.customer?.trim() ?? '';

  let initialWorkspace = null;
  let initialLoadError: string | null = null;

  if (bookingId) {
    try {
      await assertAdminBookingAccess(session, bookingId);
      const workspace = await getRefundConsoleWorkspace(bookingId);
      if (!workspace) {
        initialLoadError = 'Booking not found.';
      } else {
        initialWorkspace = toRefundConsoleWorkspaceDTO(workspace);
      }
    } catch (err) {
      initialLoadError =
        err instanceof Error ? err.message : 'Could not load refund workspace.';
    }
  }

  return (
    <div data-refund-console-workspace className={styles.workspace}>
      <RefundConsoleWorkspace
        initialBookingId={bookingId || null}
        initialCustomerId={customerId || null}
        initialWorkspace={initialWorkspace}
        initialLoadError={initialLoadError}
      />
    </div>
  );
}
