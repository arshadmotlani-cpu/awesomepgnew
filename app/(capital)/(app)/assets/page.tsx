import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Badge } from '@/src/capital/components/ui/badge';
import { Button } from '@/src/capital/components/ui/button';
import { AssetFiltersBar } from '@/src/capital/components/forms/AssetFiltersBar';
import { AssetPagination } from '@/src/capital/components/AssetPagination';
import { assetListQuerySchema } from '@/src/capital/lib/validation/schemas';
import { lifecycleLabel } from '@/src/capital/lib/vehicleLifecycle';
import { listAssetsQuery, listManufacturers } from '@/src/capital/services/assets';
import { calcHoldingDays } from '@/src/capital/lib/money';
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
  { id: 'purchase_pending', label: 'Purchase Pending' },
  { id: 'under_repair', label: 'Under Repair' },
  { id: 'ready', label: 'Ready For Sale' },
  { id: 'listed', label: 'Listed' },
  { id: 'sold', label: 'Sold' },
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
    pageSize: raw.pageSize ?? 24,
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
          <p className="text-sm text-ac-text-secondary">
            {total} vehicles · inventory workspace
          </p>
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

      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-12 text-center text-sm text-ac-text-muted">
          No vehicles match your filters.{' '}
          <Link href="/assets/new" className="text-ac-accent hover:underline">
            Create your first vehicle
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ asset, auto, partnerLabel }) => {
            const showPending =
              asset.status === 'purchased' &&
              (inventoryTab === 'purchase_pending' ||
                asset.purchasePricePaise <= 0 ||
                (asset.fundingGapPaise ?? 0) > 0);

            return (
              <Link
                key={asset.id}
                href={`/assets/${asset.id}`}
                className="ac-glass-card flex flex-col overflow-hidden transition hover:border-ac-accent/40"
              >
                <div className="relative aspect-[16/10] bg-white/5">
                  {asset.coverDocumentId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/capital/files/${asset.coverDocumentId}`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-ac-text-muted">
                      No photo
                    </div>
                  )}
                  <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                    <Badge variant={statusVariant(asset.status)}>
                      {lifecycleLabel(asset.status)}
                    </Badge>
                    {showPending ? (
                      <Badge variant="warning">Purchase Pending</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div>
                    <p className="text-xs text-ac-text-muted">
                      {auto.manufacturer} · {auto.model}
                    </p>
                    <p className="text-base font-semibold tracking-tight">{asset.displayName}</p>
                    <p className="mt-0.5 text-sm font-medium tracking-wide text-ac-accent">
                      {auto.registrationNumber || 'Registration pending'}
                    </p>
                  </div>
                  <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div>
                      <dt className="text-ac-text-muted">Purchase price</dt>
                      <dd className="font-medium">
                        <MoneyDisplay paise={asset.purchasePricePaise} className="text-xs" />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ac-text-muted">Total investment</dt>
                      <dd className="font-medium">
                        <MoneyDisplay paise={asset.totalInvestmentPaise} className="text-xs" />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ac-text-muted">Purchase date</dt>
                      <dd className="font-medium">{asset.purchaseDate}</dd>
                    </div>
                    <div>
                      <dt className="text-ac-text-muted">Days in inventory</dt>
                      <dd className="font-medium">
                        {calcHoldingDays(asset.purchaseDate, asset.saleDate)}
                      </dd>
                    </div>
                    {partnerLabel ? (
                      <div className="col-span-2">
                        <dt className="text-ac-text-muted">Partner</dt>
                        <dd className="font-medium">{partnerLabel}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <AssetPagination page={query.page} totalPages={totalPages} searchParams={filterParams} />
    </div>
  );
}
