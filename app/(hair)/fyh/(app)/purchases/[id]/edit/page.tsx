import { notFound } from 'next/navigation';
import { PurchaseEditForm } from '@/src/hair/components/purchases/PurchasesUi';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { getPurchase } from '@/src/hair/services/purchaseBrain';
import { listProducts } from '@/src/hair/services/products';

type Props = { params: Promise<{ id: string }> };

export default async function PurchaseEditPage({ params }: Props) {
  const { id } = await params;
  const ctx = await getTenantContextForPage();
  const detail = await getPurchase(id, ctx);
  if (!detail) notFound();
  const products = await listProducts({ status: 'active' }, ctx);

  return <PurchaseEditForm detail={detail} products={products} />;
}
