import type { Metadata } from 'next';
import Link from 'next/link';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Badge } from '@/src/capital/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { searchAssets } from '@/src/capital/services/search';

export const metadata: Metadata = { title: 'Search' };

type Props = { searchParams: Promise<{ q?: string }> };

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  const results = query ? await searchAssets(query) : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-ac-text-secondary">
          {query ? `Results for “${query}”` : 'Enter a query in the top bar'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {results.map(({ asset, auto }) => (
            <Link
              key={asset.id}
              href={`/assets/${asset.id}`}
              className="flex items-center justify-between rounded-lg border border-white/8 p-4 transition-colors hover:border-ac-accent/30 hover:bg-white/[0.02]"
            >
              <div>
                <p className="font-medium">{asset.displayName}</p>
                {auto.registrationNumber ? (
                  <p className="text-sm text-ac-text-secondary">{auto.registrationNumber}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <Badge>{asset.status}</Badge>
                <MoneyDisplay paise={asset.totalInvestmentPaise} />
              </div>
            </Link>
          ))}
          {query && results.length === 0 ? (
            <p className="py-8 text-center text-ac-text-muted">No assets found.</p>
          ) : null}
          {!query ? (
            <p className="py-8 text-center text-ac-text-muted">
              Search by registration, make, model, or notes.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
