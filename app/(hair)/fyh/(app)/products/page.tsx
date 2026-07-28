import { ProductsList } from '@/src/hair/components/products/ProductsUi';
import { listProducts } from '@/src/hair/services/products';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ProductsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = one(sp.q);
  const statusRaw = one(sp.status) ?? 'active';
  const status =
    statusRaw === 'inactive' || statusRaw === 'all' || statusRaw === 'active'
      ? statusRaw
      : 'active';
  const products = await listProducts({ q, status });
  return <ProductsList products={products} q={q} status={status} />;
}
