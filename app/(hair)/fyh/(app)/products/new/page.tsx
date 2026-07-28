import Link from 'next/link';
import { ProductForm } from '@/src/hair/components/products/ProductsUi';
import { Button } from '@/src/hair/components/ui/button';

export default function NewProductPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-fyh-accent">Products</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">New product</h1>
        </div>
        <Link href="/products">
          <Button type="button" variant="ghost">
            Back
          </Button>
        </Link>
      </div>
      <ProductForm mode="create" />
    </div>
  );
}
