import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  InvoicePayForm,
} from '@/src/hair/components/billing/BillingUi';
import { InternalInvoiceActions } from '@/src/hair/components/billing/InternalInvoiceActions';
import { Button } from '@/src/hair/components/ui/button';
import { summarizeInvoiceSettlement } from '@/src/hair/lib/billing/invoiceSettlement';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { getInvoiceDetail } from '@/src/hair/services/invoices';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';

type Props = {
  params: Promise<{ invoiceId: string }>;
};

function SettlementRow({
  label,
  paise,
  strong = false,
  signed = false,
}: {
  label: string;
  paise: number;
  strong?: boolean;
  signed?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'font-semibold' : ''}`}>
      <span className="text-fyh-text-secondary">{label}</span>
      <span className="tabular-nums">
        {signed ? '−' : ''}
        {formatInrFromPaise(paise)}
      </span>
    </div>
  );
}

export default async function InvoiceDetailPage({ params }: Props) {
  const { invoiceId } = await params;
  const ctx = await getTenantContextForPage();
  const detail = await getInvoiceDetail(invoiceId, ctx);
  if (!detail) notFound();

  const { invoice, customerName, customerPhone, stylistName, lines, payments, walletBalancePaise } =
    detail;
  const settlement = summarizeInvoiceSettlement({
    subtotalPaise: invoice.subtotalPaise,
    discountPaise: invoice.discountPaise,
    taxPaise: invoice.taxPaise,
    grandTotalPaise: invoice.grandTotalPaise,
    status: invoice.status,
    payments: payments.map((payment) => ({
      method: payment.method,
      amountPaise: payment.amountPaise,
    })),
  });
  const duePaise = settlement.duePaise;
  const unpaid =
    settlement.displayStatus === 'unpaid' || settlement.displayStatus === 'partial';

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 flex flex-wrap items-start justify-between gap-3 bg-[color:var(--fyh-bg)] py-2">
        <div>
          <p className="fyh-section-eyebrow">Invoice · Staff</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">{invoice.invoiceNumber}</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            {customerName} · {customerPhone}
            {stylistName ? ` · ${stylistName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <Link href="/billing/invoices">
            <Button type="button" variant="ghost" size="sm">
              Back to register
            </Button>
          </Link>
          <InternalInvoiceActions
            invoiceId={invoice.id}
            invoiceNumber={invoice.invoiceNumber}
            publicAccessToken={invoice.publicAccessToken}
            status={invoice.status}
          />
        </div>
      </div>

      <div className="fyh-glass grid gap-4 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-fyh-text-muted">Status</p>
          <p className="mt-1 capitalize">{settlement.displayStatus === 'void' ? 'Cancelled' : settlement.displayStatus}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-fyh-text-muted">Grand total</p>
          <p className="mt-1 tabular-nums">{formatInrFromPaise(invoice.grandTotalPaise)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-fyh-text-muted">Due</p>
          <p className="mt-1 tabular-nums">{formatInrFromPaise(settlement.duePaise)}</p>
        </div>
      </div>

      <div className="fyh-glass space-y-1 p-4 text-sm" data-testid="invoice-settlement">
        <SettlementRow label="Subtotal" paise={settlement.subtotalPaise} />
        {settlement.discountPaise > 0 ? (
          <SettlementRow label="Discount" paise={settlement.discountPaise} signed />
        ) : null}
        <SettlementRow label="GST" paise={settlement.taxPaise} />
        <SettlementRow label="Grand total" paise={settlement.grandTotalPaise} strong />
        {settlement.creditUsedPaise > 0 ? (
          <SettlementRow label="Advance/Credit used" paise={settlement.creditUsedPaise} />
        ) : null}
        {settlement.cashPaise > 0 ? <SettlementRow label="Cash collected" paise={settlement.cashPaise} /> : null}
        {settlement.upiPaise > 0 ? <SettlementRow label="UPI collected" paise={settlement.upiPaise} /> : null}
        {settlement.cardPaise > 0 ? <SettlementRow label="Card collected" paise={settlement.cardPaise} /> : null}
        {settlement.otherCollectedPaise > 0 ? (
          <SettlementRow label="Other collected" paise={settlement.otherCollectedPaise} />
        ) : null}
        <SettlementRow label="Total collected" paise={settlement.totalCollectedPaise} />
        <SettlementRow label="Due" paise={settlement.duePaise} strong />
      </div>

      <div className="fyh-glass overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Qty</th>
              <th className="px-4 py-3 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--fyh-border)]">
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="px-4 py-3">{line.nameSnapshot}</td>
                <td className="px-4 py-3 tabular-nums">{line.quantity}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatInrFromPaise(line.lineTotalPaise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unpaid ? (
        <InvoicePayForm
          invoiceId={invoice.id}
          duePaise={duePaise}
          walletAvailablePaise={walletBalancePaise ?? 0}
        />
      ) : null}
    </div>
  );
}
