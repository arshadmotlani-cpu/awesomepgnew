'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createExpenseAction, type ExpenseActionState } from '@/src/hair/actions/expenses';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import {
  FYH_EXPENSE_CATEGORIES,
  FYH_EXPENSE_CATEGORY_LABELS,
  FYH_EXPENSE_PAYMENT_LABELS,
  FYH_EXPENSE_PAYMENT_METHODS,
} from '@/src/hair/lib/expenseCategories';
import { salonTodayKey } from '@/src/hair/lib/appointmentDate';

const initialState: ExpenseActionState = {};
const fieldClass =
  'fyh-input w-full text-[0.8125rem] outline-none focus:border-fyh-accent/50';

export function ExpenseForm({
  staffName,
  onSaved,
}: {
  staffName: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createExpenseAction, initialState);
  const defaultDate = salonTodayKey();

  useEffect(() => {
    if (!state.success) return;
    router.refresh();
    onSaved?.();
  }, [state.success, onSaved, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <label className="fyh-label" htmlFor="title">
            Title *
          </label>
          <Input id="title" name="title" required placeholder="e.g. Electricity bill" />
        </div>
        <div className="space-y-2">
          <label className="fyh-label" htmlFor="category">
            Category *
          </label>
          <select id="category" name="category" required className={fieldClass} defaultValue="general">
            {FYH_EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {FYH_EXPENSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="fyh-label" htmlFor="expenseDate">
            Expense date *
          </label>
          <Input
            id="expenseDate"
            name="expenseDate"
            type="date"
            required
            defaultValue={defaultDate}
          />
        </div>
        <div className="space-y-2">
          <label className="fyh-label" htmlFor="amountRupees">
            Amount (₹) *
          </label>
          <Input id="amountRupees" name="amountRupees" type="number" min={0} step="0.01" required />
        </div>
        <div className="space-y-2">
          <label className="fyh-label" htmlFor="paymentMethod">
            Payment method *
          </label>
          <select
            id="paymentMethod"
            name="paymentMethod"
            required
            className={fieldClass}
            defaultValue="cash"
          >
            {FYH_EXPENSE_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {FYH_EXPENSE_PAYMENT_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label className="fyh-label" htmlFor="attachmentUrl">
            Attachment URL
          </label>
          <Input id="attachmentUrl" name="attachmentUrl" type="url" placeholder="https://…" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label className="fyh-label" htmlFor="notes">
            Notes
          </label>
          <textarea id="notes" name="notes" rows={2} className={fieldClass} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label className="fyh-label" htmlFor="staffName">
            Staff
          </label>
          <Input
            id="staffName"
            name="staffName"
            value={staffName}
            readOnly
            className="bg-[color:var(--fyh-input-bg)] opacity-90"
          />
        </div>
      </div>

      {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-fyh-success">{state.success}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save expense'}
      </Button>
    </form>
  );
}
