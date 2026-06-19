import { notFound } from 'next/navigation';
import { CheckoutSettlementPanel } from '@/src/components/admin/CheckoutSettlementPanel';
import { CheckoutSettlementAdminActions } from '@/src/components/admin/CheckoutSettlementAdminActions';
import { CheckoutSettlementPrimaryActions } from '@/src/components/admin/checkout/CheckoutSettlementPrimaryActions';
import { CheckoutSettlementSummary } from '@/src/components/admin/checkout/CheckoutSettlementSummary';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { getCheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

export const dynamic = 'force-dynamic';

export default async function CheckoutSettlementDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminPermission('deposits:write');
  const { id } = await params;
  const detail = await getCheckoutSettlementDetail(session, id);
  if (!detail) notFound();

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
      <CheckoutSettlementSummary detail={detail} />
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
