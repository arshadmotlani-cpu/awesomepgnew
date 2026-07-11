import type { Metadata } from 'next';
import Link from 'next/link';
import { CreateExpenseForm } from '@/src/capital/components/forms/CreateExpenseForm';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { listExpenses } from '@/src/capital/services/expenses';
import { listAssets } from '@/src/capital/services/assets';
import { listCategories } from '@/src/capital/services/categories';
import { ReverseExpenseButton } from './ReverseExpenseButton';

export const metadata: Metadata = { title: 'Expenses' };

export default async function ExpensesPage() {
  const [expenses, assets, categories] = await Promise.all([
    listExpenses(),
    listAssets(),
    listCategories(),
  ]);
  const assetMap = new Map(
    assets.map(({ asset, auto }) => [asset.id, auto.registrationNumber ?? asset.displayName]),
  );
  const assetOptions = assets.map(({ asset, auto }) => ({
    id: asset.id,
    label: auto.registrationNumber
      ? `${auto.registrationNumber} — ${asset.displayName}`
      : asset.displayName,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-sm text-ac-text-secondary">Cross-asset expense ledger</p>
      </div>

      <CreateExpenseForm
        categories={categories.map((c) => ({ id: c.id, label: c.label }))}
        assets={assetOptions}
      />

      <Card>
        <CardHeader>
          <CardTitle>All expenses</CardTitle>
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
