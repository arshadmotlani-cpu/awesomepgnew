import { VendorsList } from '@/src/hair/components/inventory/VendorsUi';
import { listVendors } from '@/src/hair/services/vendors';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function VendorsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = one(sp.q);
  const statusRaw = one(sp.status) ?? 'active';
  const status =
    statusRaw === 'inactive' || statusRaw === 'all' || statusRaw === 'active'
      ? statusRaw
      : 'active';
  const vendors = await listVendors({ q, status });
  return <VendorsList vendors={vendors} q={q} status={status} />;
}
