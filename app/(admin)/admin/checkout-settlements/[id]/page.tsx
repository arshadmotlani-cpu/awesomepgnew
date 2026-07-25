import { redirect } from 'next/navigation';
import { NotificationActionResolved } from '@/src/components/admin/NotificationActionResolved';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { evaluateCheckoutSettlementDeepLink } from '@/src/lib/admin/notificationDeepLinkGuard';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { bookingFinancialWorkspaceSectionHref } from '@/src/lib/bookings/bookingFinancialLinks';
import { getCheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

export const dynamic = 'force-dynamic';

export default async function CheckoutSettlementDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ read?: string }>;
}) {
  const session = await requireAdminPermission('deposits:write');
  const { id } = await params;
  const sp = await searchParams;
  const readParam = typeof sp.read === 'string' ? sp.read : undefined;
  await ensureAdminPageNotificationsSeen(
    `/admin/checkout-settlements/${id}`,
    `/admin/checkout-settlements/${id}`,
    readParam,
  );

  const deepLink = await evaluateCheckoutSettlementDeepLink(id, readParam);
  if (deepLink.status === 'resolved') {
    return <NotificationActionResolved message={deepLink.message} />;
  }

  const detail = await getCheckoutSettlementDetail(session, id);
  if (!detail) {
    return <NotificationActionResolved />;
  }

  redirect(bookingFinancialWorkspaceSectionHref(detail.bookingId, 'checkout'));
}
