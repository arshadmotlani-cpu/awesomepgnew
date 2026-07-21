import Link from 'next/link';
import { BookingFinancialWorkspace } from '@/src/components/admin/bookings/BookingFinancialWorkspace';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { NotificationActionResolved } from '@/src/components/admin/NotificationActionResolved';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { evaluateBookingDetailDeepLink } from '@/src/lib/admin/notificationDeepLinkGuard';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { loadBookingFinancialWorkspace } from '@/src/services/bookingFinancialWorkspace';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BookingFinancialWorkspacePage(
  props: PageProps<'/admin/bookings/[bookingId]/financial'>,
) {
  const session = await requireAdminPermission('deposits:read');
  const { bookingId } = await props.params;
  const sp = await props.searchParams;
  const readParam = typeof sp.read === 'string' ? sp.read : undefined;

  if (!UUID_RE.test(bookingId)) {
    return <NotificationActionResolved />;
  }

  await ensureAdminPageNotificationsSeen(
    `/admin/bookings/${bookingId}/financial`,
    `/admin/bookings/${bookingId}/financial`,
    readParam,
  );

  const bookingGuard = await evaluateBookingDetailDeepLink(bookingId);
  if (bookingGuard.status === 'resolved') {
    return <NotificationActionResolved message={bookingGuard.message} />;
  }

  const loaded = await loadBookingFinancialWorkspace(session, bookingId);
  if (!loaded.ok) {
    return (
      <>
        <ModuleBreadcrumbs
          items={[
            { label: 'Bookings', href: '/admin/bookings' },
            { label: 'Financial workspace' },
          ]}
        />
        <DbStatusBanner error={loaded.error} />
        <Link href="/admin/bookings" className="mt-4 inline-block text-sm text-[#FF5A1F] hover:underline">
          ← All bookings
        </Link>
      </>
    );
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Operations', href: '/admin/operations' },
          { label: 'Bookings', href: '/admin/bookings' },
          { label: loaded.data.customerName },
        ]}
      />
      <BookingFinancialWorkspace data={loaded.data} />
    </>
  );
}
