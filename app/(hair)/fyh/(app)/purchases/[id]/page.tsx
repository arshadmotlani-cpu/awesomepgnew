import { notFound } from 'next/navigation';
import { PurchaseDetailView } from '@/src/hair/components/purchases/PurchasesUi';
import { getPurchase } from '@/src/hair/services/purchaseBrain';
import { listPurchaseAuditEvents } from '@/src/hair/services/vendorBrain';

type Props = { params: Promise<{ id: string }> };

export default async function PurchaseDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await getPurchase(id);
  if (!detail) notFound();
  const auditEvents = await listPurchaseAuditEvents(id);

  return <PurchaseDetailView detail={detail} auditEvents={auditEvents} />;
}
