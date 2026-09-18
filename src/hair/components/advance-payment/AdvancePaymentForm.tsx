'use client';

import { useState, useTransition } from 'react';
import { FyhCustomerSearch } from '@/src/hair/components/booking/FyhCustomerSearch';
import { FyhCustomerContextStrip } from '@/src/hair/components/customers/FyhCustomerContextStrip';
import { submitAdvancePaymentAction } from '@/src/hair/actions/advancePayment';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import { FyhDatePicker } from '@/src/hair/components/ui/FyhDatePicker';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { AdvancePaymentMethod } from '@/src/hair/services/loyaltyOps';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';

const METHODS: { id: AdvancePaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
  { id: 'bank', label: 'Bank' },
];

type Props = {
  onSuccess?: (result: {
    customer: PosCustomerHit;
    invoiceId: string;
    invoiceNumber: string;
    walletBalancePaise: number;
  }) => void;
  onClose?: () => void;
  initialCustomer?: PosCustomerHit | null;
  compact?: boolean;
};

export function AdvancePaymentForm({
  onSuccess,
  onClose,
  initialCustomer = null,
  compact = false,
}: Props) {
  const [customer, setCustomer] = useState<PosCustomerHit | null>(initialCustomer);
  const [amountRupees, setAmountRupees] = useState('');
  const [method, setMethod] = useState<AdvancePaymentMethod>('cash');
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className={compact ? 'space-y-4' : 'mx-auto max-w-md space-y-5'}>
      {!customer ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-fyh-text">Customer *</p>
          <FyhCustomerSearch
            autoFocus
            createContext="advance_payment"
            placeholder="Search name, mobile, or customer code…"
            onSelect={(hit) => {
              setCustomer(hit);
              setError(null);
            }}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fyh-text">{customer.fullName}</p>
              <p className="text-xs text-fyh-text-muted">
                Available credit {formatInrFromPaise(customer.walletBalancePaise ?? 0)}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 text-xs font-medium text-fyh-accent hover:underline"
              onClick={() => setCustomer(null)}
            >
              Change
            </button>
          </div>
          <FyhCustomerContextStrip
            customerId={customer.id}
            customerName={customer.fullName}
            variant="compact"
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="fyh-panel-label">Payment amount *</span>
          <Input
            type="number"
            min={1}
            step={1}
            inputMode="decimal"
            value={amountRupees}
            onChange={(e) => setAmountRupees(e.target.value)}
            className="mt-1 h-11"
            placeholder="₹"
          />
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="fyh-panel-label">Mode *</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id)}
                className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                  method === m.id
                    ? 'border-fyh-accent bg-fyh-forest/20 text-fyh-text'
                    : 'border-[color:var(--fyh-border)] text-fyh-text-secondary hover:bg-white/5'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </label>

        <label className="block text-sm">
          <span className="fyh-panel-label">Payment date</span>
          <FyhDatePicker value={paidOn} onChange={setPaidOn} className="mt-1" aria-label="Payment date" />
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="fyh-panel-label">Note</span>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 h-10"
            placeholder="Optional"
          />
        </label>
      </div>

      {error ? <p className="text-sm text-fyh-danger">{error}</p> : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          disabled={pending || !customer}
          className="min-h-11 flex-1 sm:flex-none"
          variant="primary"
          onClick={() => {
            if (!customer) return;
            const amountPaise = Math.round(Number(amountRupees || 0) * 100);
            if (amountPaise <= 0) {
              setError('Enter a valid payment amount');
              return;
            }
            const idempotencyKey = `${customer.id}:${paidOn}:${amountPaise}:${method}:${note.trim()}`;
            startTransition(async () => {
              setError(null);
              const res = await submitAdvancePaymentAction({
                customerId: customer.id,
                amountPaise,
                method,
                notes: note.trim() || null,
                paidOn,
                idempotencyKey,
              });
              if (res.error) {
                setError(res.error);
                return;
              }
              onSuccess?.({
                customer,
                invoiceId: res.invoiceId!,
                invoiceNumber: res.invoiceNumber!,
                walletBalancePaise: res.walletBalancePaise ?? customer.walletBalancePaise,
              });
            });
          }}
        >
          {pending ? 'Saving…' : 'Receive advance'}
        </Button>
        {onClose ? (
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
