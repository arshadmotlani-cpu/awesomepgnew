import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductForm } from '@/src/hair/components/products/ProductsUi';
import { Button } from '@/src/hair/components/ui/button';
import { getProduct } from '@/src/hair/services/products';
import { formatInrFromPaise } from '@/src/hair/lib/money';

type Props = { params: Promise<{ id: string }> };

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="fyh-section-eyebrow">Product</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">{product.name}</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            {formatInrFromPaise(product.sellingPricePaise)}
            {product.sku ? ` · ${product.sku}` : ''}
            {!product.isActive ? ' · Archived' : ''}
          </p>
        </div>
        <Link href="/products">
          <Button type="button" variant="ghost">
            Back
          </Button>
        </Link>
      </div>
      <ProductForm mode="edit" product={product} />
    </div>
  );
}
