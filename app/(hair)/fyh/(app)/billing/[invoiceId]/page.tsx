import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  InvoicePayForm,
  PrintInvoiceButton,
} from '@/src/hair/components/billing/BillingUi';
import { Button } from '@/src/hair/components/ui/button';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { buildInvoicePrintHtml, getInvoiceDetail } from '@/src/hair/services/invoices';

type Props = {
  params: Promise<{ invoiceId: string }>;
};

export default async function InvoiceDetailPage({ params }: Props) {
  const { invoiceId } = await params;
  const detail = await getInvoiceDetail(invoiceId);
  if (!detail) notFound();

  const { invoice, customerName, customerPhone, stylistName, lines, payments, walletBalancePaise } =
    detail;
  const duePaise = Math.max(0, invoice.grandTotalPaise - invoice.amountPaidPaise);
  const unpaid = invoice.status === 'unpaid' || invoice.status === 'partial';
  const printHtml = buildInvoicePrintHtml(detail);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="fyh-section-eyebrow">Invoice</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">{invoice.invoiceNumber}</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            {customerName} · {customerPhone}
            {stylistName ? ` · ${stylistName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/billing/invoices">
            <Button type="button" variant="ghost" size="sm">
              Back to register
            </Button>
          </Link>
          <PrintInvoiceButton html={printHtml} />
        </div>
      </div>

      <div className="fyh-glass grid gap-4 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-fyh-text-muted">Status</p>
          <p className="mt-1 capitalize">{invoice.status}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-fyh-text-muted">Grand total</p>
          <p className="mt-1 tabular-nums">{formatInrFromPaise(invoice.grandTotalPaise)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-fyh-text-muted">Paid</p>
          <p className="mt-1 tabular-nums">{formatInrFromPaise(invoice.amountPaidPaise)}</p>
        </div>
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

      {payments.length > 0 ? (
        <div className="fyh-glass p-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-fyh-text-muted">Payments</p>
          <ul className="space-y-1 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span className="capitalize text-fyh-text-secondary">{p.method}</span>
                <span className="tabular-nums">{formatInrFromPaise(p.amountPaise)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
