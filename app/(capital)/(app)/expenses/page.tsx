import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CreateExpenseForm } from '@/src/capital/components/forms/CreateExpenseForm';
import { IncludeSoldToggle } from '@/src/capital/components/IncludeSoldToggle';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { listExpenses } from '@/src/capital/services/expenses';
import { listAssets } from '@/src/capital/services/assets';
import { listCategories } from '@/src/capital/services/categories';
import { ReverseExpenseButton } from './ReverseExpenseButton';

export const metadata: Metadata = { title: 'Expenses' };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ includeSold?: string }>;
}) {
  const params = await searchParams;
  const includeSold = params.includeSold === '1';

  const [expenses, activeAssets, allAssets, categories] = await Promise.all([
    listExpenses({ includeClosed: includeSold }),
    listAssets({ activeOnly: true, pageSize: 200 }),
    listAssets({ pageSize: 200 }),
    listCategories(),
  ]);

  // Labels for history rows — need all assets so sold ones still resolve
  const assetMap = new Map(
    allAssets.map(({ asset, auto }) => [
      asset.id,
      auto.registrationNumber ?? asset.displayName,
    ]),
  );

  const assetOptions = activeAssets.map(({ asset, auto }) => ({
    id: asset.id,
    label: auto.registrationNumber
      ? `${auto.registrationNumber} — ${asset.displayName}`
      : asset.displayName,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-sm text-ac-text-secondary">
            Costs on active vehicles only — sold vehicles are read-only
          </p>
        </div>
        <Suspense fallback={null}>
          <IncludeSoldToggle />
        </Suspense>
      </div>

      <CreateExpenseForm
        categories={categories.map((c) => ({ id: c.id, label: c.label }))}
        assets={assetOptions}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>All expenses</CardTitle>
            <p className="mt-1 text-xs text-ac-text-muted">
              {includeSold
                ? 'Showing active + sold vehicle expenses'
                : 'Showing active vehicles only'}
            </p>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-ac-text-muted">
                <th className="pb-3 pr-4 font-medium">Date</th>
                <th className="pb-3 pr-4 font-medium">Asset</th>
                <th className="pb-3 pr-4 font-medium">Description</th>
                <th className="pb-3 pr-4 font-medium text-right">Amount</th>
                <th className="pb-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-white/5">
                  <td className="py-3 pr-4">{e.expenseDate}</td>
                  <td className="py-3 pr-4">
                    <Link href={`/assets/${e.assetId}`} className="text-ac-accent hover:underline">
                      {assetMap.get(e.assetId) ?? e.assetId.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-ac-text-secondary">{e.description}</td>
                  <td className="py-3 pr-4 text-right">
                    <MoneyDisplay paise={e.amountPaise} />
                  </td>
                  <td className="py-3">
                    <ReverseExpenseButton expenseId={e.id} />
                  </td>
                </tr>
              ))}
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ac-text-muted">
                    No expenses recorded.
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
