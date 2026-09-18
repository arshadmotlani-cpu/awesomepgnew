import { Suspense } from 'react';
import { ProductsMaster } from '@/src/hair/components/products/ProductsUi';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { hasPermission } from '@/src/hair/lib/auth/permissions';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { listBrands } from '@/src/hair/services/brands';
import { listProducts } from '@/src/hair/services/products';
import { listVendors } from '@/src/hair/services/vendors';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

async function ProductsPageInner({ searchParams }: Props) {
  const sp = await searchParams;
  const q = one(sp.q);
  const statusRaw = one(sp.status) ?? 'active';
  const status =
    statusRaw === 'inactive' || statusRaw === 'all' || statusRaw === 'active'
      ? statusRaw
      : 'active';
  const ctx = await getTenantContextForPage();
  const [products, brands, vendors, session] = await Promise.all([
    listProducts({ q, status }, ctx),
    listBrands(ctx),
    listVendors({ status: 'active' }, ctx),
    getHairSession(),
  ]);
  const canManageInventory = session?.admin
    ? hasPermission(session.admin, 'page:inventory')
    : false;
  return (
    <ProductsMaster
      products={products}
      brands={brands}
      vendors={vendors}
      q={q}
      status={status}
      canManageInventory={canManageInventory}
    />
  );
}

export default function ProductsPage(props: Props) {
  return (
    <Suspense fallback={<div className="text-sm text-fyh-text-muted">Loading products…</div>}>
      <ProductsPageInner {...props} />
    </Suspense>
  );
}
