import { DepositExpressWorkspace } from '@/src/components/admin/depositExpress/DepositExpressWorkspace';
import { requireAdminPermission, requireAdminSession } from '@/src/lib/auth/guards';
import { assertAdminBookingAccess } from '@/src/lib/auth/pgAccess';
import { loadDepositExpressContext } from '@/src/services/depositExpress';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Deposit Express · Admin',
};

function assertClientSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export default async function DepositExpressPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string; customer?: string }>;
}) {
  const session = await requireAdminSession('/admin/deposit-express');
  await requireAdminPermission('deposits:write');

  const sp = await searchParams;
  const bookingId = sp.booking?.trim() ?? '';
  const customerId = sp.customer?.trim() ?? '';

  let initialContext = null;
  let initialLoadError: string | null = null;

  if (bookingId) {
    try {
      await assertAdminBookingAccess(session, bookingId);
      const context = await loadDepositExpressContext(bookingId);
      if (!context) {
        initialLoadError = 'Booking not found.';
      } else {
        try {
          initialContext = assertClientSerializable(context);
        } catch {
          initialLoadError = 'Could not prepare deposit workspace for display.';
        }
      }
    } catch (err) {
      initialLoadError =
        err instanceof Error ? err.message : 'Could not load deposit workspace.';
    }
  }

  return (
    <div data-deposit-express-workspace className="min-h-[calc(100vh-4rem)]">
      <DepositExpressWorkspace
        initialBookingId={bookingId || null}
        initialCustomerId={customerId || null}
        initialContext={initialContext}
        initialLoadError={initialLoadError}
      />
    </div>
  );
}
