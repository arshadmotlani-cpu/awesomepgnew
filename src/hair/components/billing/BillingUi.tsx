'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { payInvoiceAction } from '@/src/hair/actions/appointments';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export type BillingInvoiceRow = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  status: string;
  grandTotalPaise: number;
  amountPaidPaise: number;
  createdAtIso: string;
  paidAtIso: string | null;
};

export function BillingUi({ invoices }: { invoices: BillingInvoiceRow[] }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="fyh-section-eyebrow">Money</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Invoices from appointment checkout. Retail product sales use the Products catalog when
          that flow is enabled; today most invoices come from completed appointments.
        </p>
        <p className="mt-2 text-xs text-fyh-text-muted">
          Need a product-only sale? Record it from Inventory → Products (retail invoice path).
        </p>
        <Link
          href="/billing/invoices"
          className="mt-3 inline-flex text-sm font-medium text-fyh-accent hover:underline"
        >
          Open full invoice register →
        </Link>
      </div>

      <div className="fyh-glass overflow-hidden">
        {invoices.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-fyh-text-muted">
            No invoices yet. Complete an appointment checkout to create one.
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {invoices.map((inv) => (
                <div key={inv.id} className="fyh-glass space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium tabular-nums">{inv.invoiceNumber}</p>
                      <p className="mt-0.5 text-xs text-fyh-text-muted">{inv.customerName}</p>
                    </div>
                    <span className="tabular-nums text-fyh-accent">
                      {formatInrFromPaise(inv.grandTotalPaise)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-fyh-text-muted">
                    <span className="capitalize">{inv.status}</span>
                    <span className="tabular-nums">{inv.createdAtIso.slice(0, 10)}</span>
                  </div>
                  <Link href={`/billing/${inv.id}`} className="block">
                    <Button type="button" variant="secondary" size="sm" className="w-full">
                      Open
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
            <div className="fyh-glass hidden overflow-hidden md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-3 font-medium tabular-nums">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">{inv.customerName}</td>
                  <td className="px-4 py-3 capitalize text-fyh-text-muted">{inv.status}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatInrFromPaise(inv.grandTotalPaise)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-fyh-text-muted">
                    {inv.createdAtIso.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/billing/${inv.id}`}>
                      <Button type="button" variant="secondary" size="sm">
                        Open
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function PrintInvoiceButton({ html }: { html: string }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => {
        // Do not use noopener — it nulls window.open return value in some browsers.
        const w = window.open('', '_blank', 'width=800,height=900');
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
      }}
    >
      Print
    </Button>
  );
}

export function InvoicePayForm({
  invoiceId,
  duePaise,
  walletAvailablePaise = 0,
}: {
  invoiceId: string;
  duePaise: number;
  walletAvailablePaise?: number;
}) {
  const router = useRouter();
  const [cash, setCash] = useState(String(Math.max(0, duePaise) / 100));
  const [upi, setUpi] = useState('');
  const [card, setCard] = useState('');
  const [bank, setBank] = useState('');
  const [wallet, setWallet] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="fyh-glass space-y-3 p-4">
      <p className="text-sm text-fyh-text-secondary">
        Amount due: <span className="font-medium text-fyh-text">{formatInrFromPaise(duePaise)}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <label className="text-sm text-fyh-text-secondary">Cash ₹</label>
          <Input value={cash} onChange={(e) => setCash(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-fyh-text-secondary">UPI ₹</label>
          <Input value={upi} onChange={(e) => setUpi(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-fyh-text-secondary">Card ₹</label>
          <Input value={card} onChange={(e) => setCard(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-fyh-text-secondary">Bank ₹</label>
          <Input value={bank} onChange={(e) => setBank(e.target.value)} />
        </div>
        {walletAvailablePaise > 0 ? (
          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary">
              Wallet ₹ (avail {formatInrFromPaise(walletAvailablePaise)})
            </label>
            <Input value={wallet} onChange={(e) => setWallet(e.target.value)} />
          </div>
        ) : null}
      </div>
      {error ? <p className="text-sm text-fyh-danger">{error}</p> : null}
      {message ? <p className="text-sm text-fyh-success">{message}</p> : null}
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          const payments = [
            { method: 'cash' as const, amountPaise: Math.round(Number(cash || 0) * 100) },
            { method: 'upi' as const, amountPaise: Math.round(Number(upi || 0) * 100) },
            { method: 'card' as const, amountPaise: Math.round(Number(card || 0) * 100) },
            { method: 'bank' as const, amountPaise: Math.round(Number(bank || 0) * 100) },
            { method: 'wallet' as const, amountPaise: Math.round(Number(wallet || 0) * 100) },
          ].filter((p) => p.amountPaise > 0);
          startTransition(async () => {
            setError(null);
            const res = await payInvoiceAction(invoiceId, payments);
            if (res.error) setError(res.error);
            else {
              setMessage(res.success ?? 'Payment recorded');
              router.refresh();
            }
          });
        }}
      >
        {pending ? 'Recording…' : duePaise === 0 ? 'Mark paid (₹0)' : 'Record payment'}
      </Button>
    </div>
  );
}
