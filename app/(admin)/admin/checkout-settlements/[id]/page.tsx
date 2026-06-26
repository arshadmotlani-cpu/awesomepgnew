import Link from 'next/link';
import { NotificationActionResolved } from '@/src/components/admin/NotificationActionResolved';
import { CheckoutSettlementPanel } from '@/src/components/admin/CheckoutSettlementPanel';
import { CheckoutSettlementAdminActions } from '@/src/components/admin/CheckoutSettlementAdminActions';
import { CheckoutSettlementPrimaryActions } from '@/src/components/admin/checkout/CheckoutSettlementPrimaryActions';
import { assessCheckoutSettlementReadiness } from '@/src/lib/checkout/checkoutSettlementReadiness';
import { CheckoutSettlementCommandCenter } from '@/src/components/admin/checkout/CheckoutSettlementCommandCenter';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { evaluateCheckoutSettlementDeepLink } from '@/src/lib/admin/notificationDeepLinkGuard';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
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

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Checkout settlements', href: '/admin/checkout-settlements' },
          { label: detail.customerName },
        ]}
      />
      <PageHeader
        title={`Checkout — ${detail.customerName}`}
        description={`${detail.pgName} · Room ${detail.roomNumber} · ${detail.bedCode}`}
      />
      <CheckoutSettlementCommandCenter detail={detail} />
      <CheckoutSettlementPrimaryActions detail={detail} />
      <CheckoutSettlementPanel detail={detail} />
      <div className="mt-8">
        <CheckoutSettlementAdminActions
          settlementId={detail.id}
          status={detail.status}
          amountsLocked={detail.amountsLocked}
        />
      </div>
    </>
  );
}
