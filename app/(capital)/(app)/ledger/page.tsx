import type { Metadata } from 'next';
import { Suspense } from 'react';
import { desc, eq, isNull, or, sql } from 'drizzle-orm';
import { IncludeSoldToggle } from '@/src/capital/components/IncludeSoldToggle';
import { LedgerExportPanel } from '@/src/capital/components/forms/LedgerExportPanel';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Badge } from '@/src/capital/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { capitalDb } from '@/src/capital/db/client';
import { acAssets, acLedgerEntries } from '@/src/capital/db/schema';

export const metadata: Metadata = { title: 'Ledger' };

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ includeSold?: string }>;
}) {
  const params = await searchParams;
  const includeSold = params.includeSold === '1';

  const entries = includeSold
    ? await capitalDb
        .select()
        .from(acLedgerEntries)
        .orderBy(desc(acLedgerEntries.createdAt))
        .limit(100)
    : await capitalDb
        .select({
          id: acLedgerEntries.id,
          entryType: acLedgerEntries.entryType,
          direction: acLedgerEntries.direction,
          description: acLedgerEntries.description,
          amountPaise: acLedgerEntries.amountPaise,
          createdAt: acLedgerEntries.createdAt,
          assetId: acLedgerEntries.assetId,
        })
        .from(acLedgerEntries)
        .leftJoin(acAssets, eq(acLedgerEntries.assetId, acAssets.id))
        .where(
          or(
            isNull(acLedgerEntries.assetId),
            sql`${acAssets.status} NOT IN ('sold', 'settled', 'cancelled')`,
          ),
        )
        .orderBy(desc(acLedgerEntries.createdAt))
        .limit(100);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ledger</h1>
          <p className="text-sm text-ac-text-secondary">Immutable financial history</p>
        </div>
        <Suspense fallback={null}>
          <IncludeSoldToggle />
        </Suspense>
      </div>

      <LedgerExportPanel />

      <Card>
        <CardHeader>
          <CardTitle>Recent entries</CardTitle>
          <p className="text-xs text-ac-text-muted">
            {includeSold
              ? 'Showing all entries including sold vehicles'
              : 'Active vehicles + unassigned entries'}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-ac-text-muted">
                <th className="pb-3 pr-4 font-medium">Date</th>
                <th className="pb-3 pr-4 font-medium">Type</th>
                <th className="pb-3 pr-4 font-medium">Direction</th>
                <th className="pb-3 pr-4 font-medium">Description</th>
                <th className="pb-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-white/5">
                  <td className="py-3 pr-4 whitespace-nowrap text-ac-text-secondary">
                    {e.createdAt.toLocaleDateString('en-IN')}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline">{e.entryType}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant={e.direction === 'credit' ? 'success' : 'warning'}>
                      {e.direction}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-ac-text-secondary">{e.description}</td>
                  <td className="py-3 text-right">
                    <MoneyDisplay paise={e.amountPaise} />
                  </td>
                </tr>
              ))}
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ac-text-muted">
                    No ledger entries yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
