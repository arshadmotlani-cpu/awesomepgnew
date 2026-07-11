import type { Metadata } from 'next';
import { desc } from 'drizzle-orm';
import { LedgerExportPanel } from '@/src/capital/components/forms/LedgerExportPanel';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Badge } from '@/src/capital/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { capitalDb } from '@/src/capital/db/client';
import { acLedgerEntries } from '@/src/capital/db/schema';

export const metadata: Metadata = { title: 'Ledger' };

export default async function LedgerPage() {
  const entries = await capitalDb
    .select()
    .from(acLedgerEntries)
    .orderBy(desc(acLedgerEntries.createdAt))
    .limit(100);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ledger</h1>
        <p className="text-sm text-ac-text-secondary">Immutable financial history</p>
      </div>

      <LedgerExportPanel />

      <Card>
        <CardHeader>
          <CardTitle>Recent entries</CardTitle>
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
