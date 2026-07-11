import type { Metadata } from 'next';
import Link from 'next/link';
import { CreatePaymentForm } from '@/src/capital/components/forms/CreatePaymentForm';
import { ReversePaymentButton } from '@/src/capital/components/forms/ReversePaymentButton';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Badge } from '@/src/capital/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { listPayments } from '@/src/capital/services/payments';
import { listAssets } from '@/src/capital/services/assets';

export const metadata: Metadata = { title: 'Payments' };

export default async function PaymentsPage() {
  const [payments, eligibleAssets, allAssets] = await Promise.all([
    listPayments(),
    // Active + sold (awaiting settlement) — settled/cancelled excluded
    listAssets({ paymentEligibleOnly: true, pageSize: 200 }),
    listAssets({ pageSize: 200 }),
  ]);
  const assetMap = new Map(
    allAssets.map(({ asset, auto }) => [
      asset.id,
      auto.registrationNumber ?? asset.displayName,
    ]),
  );
  const assetOptions = eligibleAssets.map(({ asset, auto }) => ({
    id: asset.id,
    label: [
      auto.registrationNumber
        ? `${auto.registrationNumber} — ${asset.displayName}`
        : asset.displayName,
      asset.status === 'sold' ? '(Sold)' : null,
    ]
      .filter(Boolean)
      .join(' '),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-ac-text-secondary">
          Capital return & profit on open or sold (pre-settlement) vehicles
        </p>
      </div>

      <CreatePaymentForm assets={assetOptions} />

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-ac-text-muted">
                <th className="pb-3 pr-4 font-medium">Date</th>
                <th className="pb-3 pr-4 font-medium">Asset</th>
                <th className="pb-3 pr-4 font-medium">Type</th>
                <th className="pb-3 pr-4 font-medium">Mode</th>
                <th className="pb-3 pr-4 font-medium text-right">Amount</th>
                <th className="pb-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-white/5">
                  <td className="py-3 pr-4">{p.receivedAt}</td>
                  <td className="py-3 pr-4">
                    {p.assetId ? (
                      <Link href={`/assets/${p.assetId}`} className="text-ac-accent hover:underline">
                        {assetMap.get(p.assetId) ?? p.assetId.slice(0, 8)}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant="secondary">{p.paymentType}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-ac-text-secondary">{p.paymentMode}</td>
                  <td className="py-3 pr-4 text-right">
                    <MoneyDisplay paise={p.amountPaise} />
                  </td>
                  <td className="py-3">
                    <ReversePaymentButton paymentId={p.id} />
                  </td>
                </tr>
              ))}
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-ac-text-muted">
                    No payments recorded.
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
