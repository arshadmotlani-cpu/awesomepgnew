import { notFound } from 'next/navigation';
import { PurchaseOrderDetail } from '@/src/hair/components/inventory/PurchasesUi';
import { listProducts } from '@/src/hair/services/products';
import { getPurchaseOrder } from '@/src/hair/services/purchases';
import { listVendors } from '@/src/hair/services/vendors';

type Props = { params: Promise<{ id: string }> };

export default async function PurchaseDetailPage({ params }: Props) {
  const { id } = await params;
  const [detail, vendors, products] = await Promise.all([
    getPurchaseOrder(id),
    listVendors({ status: 'active' }),
    listProducts({ status: 'active' }),
  ]);
  if (!detail) notFound();

  return <PurchaseOrderDetail detail={detail} vendors={vendors} products={products} />;
}
