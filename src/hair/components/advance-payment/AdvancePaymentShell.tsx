'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { FyhCustomerSearch } from '@/src/hair/components/booking/FyhCustomerSearch';
import { FyhCustomerContextStrip } from '@/src/hair/components/customers/FyhCustomerContextStrip';
import { submitAdvancePaymentAction } from '@/src/hair/actions/advancePayment';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { AdvancePaymentMethod } from '@/src/hair/services/loyaltyOps';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';

const METHODS: { id: AdvancePaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
  { id: 'bank', label: 'Bank' },
];

export function AdvancePaymentShell() {
  const [step, setStep] = useState<'customer' | 'pay' | 'done'>('customer');
  const [customer, setCustomer] = useState<PosCustomerHit | null>(null);
  const [amountRupees, setAmountRupees] = useState('');
  const [method, setMethod] = useState<AdvancePaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  if (step === 'done' && customer) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <div>
          <p className="fyh-section-eyebrow">Advance Payment</p>
          <h1 className="fyh-display mt-2 font-semibold text-fyh-text">Wallet credited</h1>
          <p className="mt-2 text-sm text-fyh-text-secondary">
            {customer.fullName} · new balance{' '}
            {newBalance != null ? formatInrFromPaise(newBalance) : '—'}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={`/customers/${customer.id}`}>
            <Button type="button">View customer</Button>
          </Link>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setStep('customer');
              setCustomer(null);
              setAmountRupees('');
              setReference('');
              setNotes('');
              setNewBalance(null);
            }}
          >
            Another advance
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'customer') {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-6 md:py-10">
        <div>
          <p className="fyh-section-eyebrow">Advance Payment</p>
          <h1 className="fyh-display mt-1 font-semibold text-fyh-text">Find customer</h1>
          <p className="mt-1 text-sm text-fyh-text-muted">
            Add money to wallet · no invoice
          </p>
        </div>
        <FyhCustomerSearch
          autoFocus
          createContext="quick_sale"
          placeholder="Search by name, phone, customer code..."
          onSelect={(hit) => {
            setCustomer(hit);
            setStep('pay');
            setError(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-6 md:py-10">
      <div>
        <p className="fyh-section-eyebrow">Advance Payment</p>
        <button
          type="button"
          className="fyh-display mt-1 text-left text-xl font-semibold text-fyh-text hover:text-fyh-accent"
          onClick={() => setStep('customer')}
        >
          {customer?.fullName}
        </button>
        <p className="text-sm text-fyh-text-muted">
          Current wallet {formatInrFromPaise(customer?.walletBalancePaise ?? 0)}
        </p>
        {customer ? (
          <FyhCustomerContextStrip
            customerId={customer.id}
            customerName={customer.fullName}
            variant="compact"
            className="mt-3"
          />
        ) : null}
      </div>

      <label className="block text-sm text-fyh-text-secondary">
        Amount ₹ *
        <Input
          type="number"
          min={1}
          step={1}
          value={amountRupees}
          onChange={(e) => setAmountRupees(e.target.value)}
          className="mt-1 h-12 text-lg"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm text-fyh-text-secondary">Payment method</legend>
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethod(m.id)}
              className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                method === m.id
                  ? 'border-fyh-accent bg-fyh-forest/20 text-fyh-text'
                  : 'border-[color:var(--fyh-border)] text-fyh-text-secondary hover:bg-white/5'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm text-fyh-text-secondary">
        Reference (optional)
        <Input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1 h-10" />
      </label>
      <label className="block text-sm text-fyh-text-secondary">
        Notes (optional)
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 h-10" />
      </label>

      {error ? <p className="text-sm text-fyh-danger">{error}</p> : null}

      <Button
        type="button"
        disabled={pending || !customer}
        className="h-12 w-full"
        onClick={() => {
          if (!customer) return;
          const amountPaise = Math.round(Number(amountRupees || 0) * 100);
          startTransition(async () => {
            setError(null);
            const res = await submitAdvancePaymentAction({
              customerId: customer.id,
              amountPaise,
              method,
              reference: reference.trim() || null,
              notes: notes.trim() || null,
            });
            if (res.error) setError(res.error);
            else {
              setNewBalance(res.walletBalancePaise ?? null);
              setStep('done');
            }
          });
        }}
      >
        {pending ? 'Saving…' : 'Credit wallet'}
      </Button>
    </div>
  );
}
