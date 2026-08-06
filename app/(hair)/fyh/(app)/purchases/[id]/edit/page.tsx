import { notFound } from 'next/navigation';
import { PurchaseEditForm } from '@/src/hair/components/purchases/PurchasesUi';
import { getPurchase } from '@/src/hair/services/purchaseBrain';
import { listProducts } from '@/src/hair/services/products';

type Props = { params: Promise<{ id: string }> };

export default async function PurchaseEditPage({ params }: Props) {
  const { id } = await params;
  const detail = await getPurchase(id);
  if (!detail) notFound();
  const products = await listProducts();

  return <PurchaseEditForm detail={detail} products={products} />;
}
