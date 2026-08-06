import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ProductDetailActions,
  ProductForm,
  ProductProfitSummary,
} from '@/src/hair/components/products/ProductsUi';
import { productTypeLabel } from '@/src/hair/lib/productTypes';
import { listBrands } from '@/src/hair/services/brands';
import { getProduct } from '@/src/hair/services/products';

type Props = { params: Promise<{ id: string }> };

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const [product, brands] = await Promise.all([getProduct(id), listBrands()]);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Link href="/products" className="text-sm text-fyh-accent hover:underline">
            ← Back
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="fyh-display text-2xl font-semibold">{product.name}</h1>
            <span className="rounded-full bg-[color:var(--fyh-surface-muted)] px-2.5 py-0.5 text-xs font-medium">
              {productTypeLabel(product.productType)}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                product.isActive
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : 'bg-gray-500/10 text-fyh-text-muted'
              }`}
            >
              {product.isActive ? 'Active' : 'Archived'}
            </span>
          </div>
          <p className="text-sm text-fyh-text-secondary">{product.brandName}</p>
        </div>
        <ProductDetailActions product={product} />
      </div>

      {product.productType === 'retail' ? (
        <div className="fyh-glass p-4">
          <ProductProfitSummary product={product} />
        </div>
      ) : null}

      <div id="edit">
        <ProductForm mode="edit" product={product} brands={brands} />
      </div>
    </div>
  );
}
