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

export const metadata: Metadata = { title: 'Assets' };

function statusVariant(status: string) {
  if (status === 'sold' || status === 'settled') return 'success' as const;
  if (status === 'cancelled') return 'danger' as const;
  if (status === 'listed' || status === 'ready') return 'default' as const;
  return 'secondary' as const;
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AssetsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const query = assetListQuerySchema.parse({
    page: raw.page,
    pageSize: raw.pageSize ?? 25,
    status: raw.status,
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
          <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
          <p className="text-sm text-ac-text-secondary">{total} vehicles</p>
        </div>
        <Link href="/assets/new">
          <Button>New asset</Button>
        </Link>
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
                <th className="pb-3 pr-4 font-medium">Vehicle</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium text-right">Investment</th>
                <th className="pb-3 font-medium text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ asset, auto }) => (
                <tr key={asset.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-3 pr-4">
                    <Link href={`/assets/${asset.id}`} className="font-medium text-ac-accent hover:underline">
                      {asset.displayName}
                    </Link>
                    {auto.registrationNumber ? (
                      <p className="text-xs text-ac-text-muted">{auto.registrationNumber}</p>
                    ) : null}
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
                  <td colSpan={4} className="py-8 text-center text-ac-text-muted">
                    No assets match your filters.{' '}
                    <Link href="/assets/new" className="text-ac-accent hover:underline">
                      Create your first asset
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
