import { RefundConsoleWorkspace } from '@/src/components/admin/refunds/RefundConsoleWorkspace';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { getRefundConsoleWorkspace } from '@/src/services/refundConsole';
import styles from './refunds.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Refund Console · Admin',
  description: 'Deposit refund payout workspace.',
};

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  await requireAdminSession('/admin/refunds');
  const sp = await searchParams;
  const bookingId = sp.booking?.trim() ?? '';
  const initialWorkspace = bookingId ? await getRefundConsoleWorkspace(bookingId) : null;

  return (
    <div data-refund-console-workspace className={styles.workspace}>
      <RefundConsoleWorkspace
        initialBookingId={bookingId || null}
        initialWorkspace={initialWorkspace}
      />
    </div>
  );
}
