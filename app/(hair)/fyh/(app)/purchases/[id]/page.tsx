import { notFound } from 'next/navigation';
import { PurchaseDetailView } from '@/src/hair/components/purchases/PurchasesUi';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { getPurchase } from '@/src/hair/services/purchaseBrain';
import { listPurchaseAuditEvents } from '@/src/hair/services/vendorBrain';

type Props = { params: Promise<{ id: string }> };

export default async function PurchaseDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await getTenantContextForPage();
  const detail = await getPurchase(id, ctx);
  if (!detail) notFound();
  const auditEvents = await listPurchaseAuditEvents(id, ctx);

  return <PurchaseDetailView detail={detail} auditEvents={auditEvents} />;
}
