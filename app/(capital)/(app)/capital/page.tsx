import type { Metadata } from 'next';
import { CreateCapitalForm } from '@/src/capital/components/forms/CreateCapitalForm';
import { ReverseCapitalButton } from '@/src/capital/components/forms/ReverseCapitalButton';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { listCapitalInvestments } from '@/src/capital/services/capital';

export const metadata: Metadata = { title: 'Capital' };

export default async function CapitalPage() {
  const investments = await listCapitalInvestments();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Capital</h1>
        <p className="text-sm text-ac-text-secondary">Investment injections and history</p>
      </div>

      <CreateCapitalForm />

      <Card>
        <CardHeader>
          <CardTitle>Investment history</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-ac-text-muted">
                <th className="pb-3 pr-4 font-medium">Date</th>
                <th className="pb-3 pr-4 font-medium">Mode</th>
                <th className="pb-3 pr-4 font-medium">Reference</th>
                <th className="pb-3 pr-4 font-medium text-right">Amount</th>
                <th className="pb-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {investments.map((inv) => (
                <tr key={inv.id} className="border-b border-white/5">
                  <td className="py-3 pr-4">{inv.investedAt}</td>
                  <td className="py-3 pr-4 text-ac-text-secondary">{inv.paymentMode}</td>
                  <td className="py-3 pr-4 text-ac-text-secondary">{inv.referenceNumber ?? '—'}</td>
                  <td className="py-3 pr-4 text-right">
                    <MoneyDisplay paise={inv.amountPaise} />
                  </td>
                  <td className="py-3">
                    <ReverseCapitalButton investmentId={inv.id} />
                  </td>
                </tr>
              ))}
              {investments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ac-text-muted">
                    No capital investments yet.
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
