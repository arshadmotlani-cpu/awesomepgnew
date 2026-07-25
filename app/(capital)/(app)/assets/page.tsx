import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Badge } from '@/src/capital/components/ui/badge';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { AssetFiltersBar } from '@/src/capital/components/forms/AssetFiltersBar';
import { AssetPagination } from '@/src/capital/components/AssetPagination';
import { assetListQuerySchema } from '@/src/capital/lib/validation/schemas';
import { listAssetsQuery, listManufacturers } from '@/src/capital/services/assets';
import { cn } from '@/src/capital/lib/utils';

export const metadata: Metadata = { title: 'Vehicles' };


function statusVariant(status: string) {
  if (status === 'sold' || status === 'settled') return 'success' as const;
  if (status === 'cancelled') return 'danger' as const;
  if (status === 'listed' || status === 'ready') return 'default' as const;
  return 'secondary' as const;
}

const INVENTORY_TABS = [
  { id: 'in_stock', label: 'In Stock' },
  { id: 'sold', label: 'Sold' },
  { id: 'all', label: 'All' },
  { id: 'archived', label: 'Archived' },
] as const;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AssetsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const inventoryTabRaw = typeof raw.tab === 'string' ? raw.tab : 'in_stock';
  const inventoryTab = INVENTORY_TABS.some((t) => t.id === inventoryTabRaw)
    ? (inventoryTabRaw as (typeof INVENTORY_TABS)[number]['id'])
    : 'in_stock';

  const query = assetListQuerySchema.parse({
    page: raw.page,
    pageSize: raw.pageSize ?? 25,
    status: raw.status,
    inventoryTab,
    search: raw.search,
    manufacturer: raw.manufacturer,
    sort: raw.sort,
    order: raw.order,
    profitFilter: raw.profitFilter,
  });

  const [{ rows, total, totalPages }, manufacturers] = await Promise.all([
    listAssetsQuery(query),
    listManufacturers(),
  ]);

  const filterParams = {
    tab: inventoryTab,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    search: typeof raw.search === 'string' ? raw.search : undefined,
    manufacturer: typeof raw.manufacturer === 'string' ? raw.manufacturer : undefined,
    sort: typeof raw.sort === 'string' ? raw.sort : undefined,
    order: typeof raw.order === 'string' ? raw.order : undefined,
    profitFilter: typeof raw.profitFilter === 'string' ? raw.profitFilter : undefined,
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vehicles</h1>
          <p className="text-sm text-ac-text-secondary">{total} vehicles</p>
        </div>
        <Link href="/assets/new">
          <Button>New vehicle</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {INVENTORY_TABS.map((tab) => {
          const href = `/assets?tab=${tab.id}`;
          const active = inventoryTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={href}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm transition',
                active
                  ? 'bg-ac-accent/20 text-ac-accent'
                  : 'bg-white/5 text-ac-text-secondary hover:bg-white/10',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <Suspense fallback={null}>
        <AssetFiltersBar manufacturers={manufacturers} />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-ac-text-muted">
                <th className="pb-3 pr-4 font-medium w-14"></th>
                <th className="pb-3 pr-4 font-medium">Registration</th>
                <th className="pb-3 pr-4 font-medium">Vehicle</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium text-right">Net Cost</th>
                <th className="pb-3 font-medium text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ asset, auto }) => (
                <tr key={asset.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-3 pr-4">
                    <Link href={`/assets/${asset.id}`} className="block">
                      {asset.coverDocumentId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/capital/files/${asset.coverDocumentId}`}
                          alt=""
                          className="h-12 w-12 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[10px] text-ac-text-muted">
                          No photo
                        </div>
                      )}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <Link
                      href={`/assets/${asset.id}`}
                      className="font-semibold tracking-wide text-ac-accent hover:underline"
                    >
                      {auto.registrationNumber || '—'}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <Link href={`/assets/${asset.id}`} className="font-medium hover:underline">
                      {asset.displayName}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant={statusVariant(asset.status)}>{asset.status}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <MoneyDisplay paise={asset.totalInvestmentPaise} />
                  </td>
                  <td className="py-3 text-right">
                    <MoneyDisplay paise={asset.outstandingPaise} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-ac-text-muted">
                    No vehicles match your filters.{' '}
                    <Link href="/assets/new" className="text-ac-accent hover:underline">
                      Create your first vehicle
                    </Link>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <AssetPagination page={query.page} totalPages={totalPages} searchParams={filterParams} />
        </CardContent>
      </Card>
    </div>
  );
}
