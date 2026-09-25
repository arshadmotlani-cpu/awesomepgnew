'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createExpenseAction,
  updateExpenseAction,
  type ExpenseActionState,
} from '@/src/hair/actions/expenses';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import {
  FYH_MANUAL_GENERAL_EXPENSE_CATEGORIES,
  FYH_EXPENSE_CATEGORY_LABELS,
  FYH_EXPENSE_PAYMENT_LABELS,
  FYH_EXPENSE_PAYMENT_METHODS,
} from '@/src/hair/lib/expenseCategories';
import {
  FYH_EXPENSE_FOR,
  FYH_EXPENSE_FOR_LABELS,
  FYH_EXPENSE_PAID_BY,
  FYH_EXPENSE_PAID_BY_LABELS,
  type FyhExpensePaidBy,
  parseExpensePaidBy,
} from '@/src/hair/lib/expenseFields';
import { salonTodayKey } from '@/src/hair/lib/appointmentDate';
import type { FyhExpense } from '@/src/hair/db/schema';

const initialState: ExpenseActionState = {};
const fieldClass =
  'fyh-input w-full text-[0.8125rem] outline-none focus:border-fyh-accent/50';

export type StaffOption = { id: string; name: string };

export function ExpenseForm({
  staffName,
  staffOptions,
  expense,
  onSaved,
}: {
  staffName: string;
  staffOptions: StaffOption[];
  expense?: FyhExpense | null;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(expense?.id);
  const action = isEdit ? updateExpenseAction : createExpenseAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const defaultDate = expense?.expenseDate ?? salonTodayKey();
  const [paidBy, setPaidBy] = useState<FyhExpensePaidBy>(expense?.paidBy ?? 'business_cash');

  useEffect(() => {
    if (!state.success) return;
    router.refresh();
    onSaved?.();
  }, [state.success, onSaved, router]);

  useEffect(() => {
    if (expense?.paidBy) setPaidBy(expense.paidBy);
  }, [expense?.paidBy]);

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-5">
      {isEdit ? <input type="hidden" name="id" value={expense!.id} /> : null}
      <input type="hidden" name="recorderName" value={staffName} />

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fyh-text-muted">
          Expense details
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="fyh-label" htmlFor="title">Title *</label>
            <Input
              id="title"
              name="title"
              required
              defaultValue={expense?.title ?? ''}
              placeholder="e.g. Electricity bill"
            />
            {fieldErrors.title ? <p className="text-xs text-fyh-danger">{fieldErrors.title}</p> : null}
          </div>
          <div className="space-y-1.5">
            <label className="fyh-label" htmlFor="category">Category *</label>
            <select
              id="category"
              name="category"
              required
              className={fieldClass}
              defaultValue={expense?.category ?? 'general'}
            >
              {FYH_MANUAL_GENERAL_EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{FYH_EXPENSE_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="fyh-label" htmlFor="expenseDate">Expense date *</label>
            <Input
              id="expenseDate"
              name="expenseDate"
              type="date"
              required
              defaultValue={defaultDate}
            />
          </div>
          <div className="space-y-1.5">
            <label className="fyh-label" htmlFor="expenseFor">Expense for *</label>
            <select
              id="expenseFor"
              name="expenseFor"
              required
              className={fieldClass}
              defaultValue={expense?.expenseFor ?? 'organization'}
            >
              {FYH_EXPENSE_FOR.map((v) => (
                <option key={v} value={v}>{FYH_EXPENSE_FOR_LABELS[v]}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fyh-text-muted">
          Payment details
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="fyh-label" htmlFor="paidBy">Paid by *</label>
            <select
              id="paidBy"
              name="paidBy"
              required
              className={fieldClass}
              value={paidBy}
              onChange={(e) => {
                const next = parseExpensePaidBy(e.target.value);
                if (next) setPaidBy(next);
              }}
            >
              {FYH_EXPENSE_PAID_BY.map((v) => (
                <option key={v} value={v}>{FYH_EXPENSE_PAID_BY_LABELS[v]}</option>
              ))}
            </select>
          </div>
          {paidBy === 'staff' ? (
            <div className="space-y-1.5">
              <label className="fyh-label" htmlFor="staffEmployeeId">Staff name *</label>
              <select
                id="staffEmployeeId"
                name="staffEmployeeId"
                required
                className={fieldClass}
                defaultValue={expense?.staffEmployeeId ?? ''}
              >
                <option value="">Select staff</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {fieldErrors.staffEmployeeId ? (
                <p className="text-xs text-fyh-danger">{fieldErrors.staffEmployeeId}</p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <label className="fyh-label" htmlFor="amountRupees">Expense amount (₹) *</label>
            <Input
              id="amountRupees"
              name="amountRupees"
              type="number"
              min={0.01}
              step="0.01"
              required
              defaultValue={expense ? (expense.amountPaise / 100).toFixed(2) : undefined}
            />
            {fieldErrors.amountRupees ? (
              <p className="text-xs text-fyh-danger">{fieldErrors.amountRupees}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label className="fyh-label" htmlFor="paymentMethod">Payment mode *</label>
            <select
              id="paymentMethod"
              name="paymentMethod"
              required
              className={fieldClass}
              defaultValue={expense?.paymentMethod ?? 'cash'}
            >
              {FYH_EXPENSE_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{FYH_EXPENSE_PAYMENT_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="fyh-label" htmlFor="billNumber">Bill no.</label>
            <Input id="billNumber" name="billNumber" defaultValue={expense?.billNumber ?? ''} />
          </div>
          <div className="space-y-1.5">
            <label className="fyh-label" htmlFor="companyName">Company name</label>
            <Input id="companyName" name="companyName" defaultValue={expense?.companyName ?? ''} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="fyh-label" htmlFor="referenceId">Reference ID</label>
            <Input id="referenceId" name="referenceId" defaultValue={expense?.referenceId ?? ''} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fyh-text-muted">
          Notes &amp; attachment
        </h3>
        <div className="space-y-1.5">
          <label className="fyh-label" htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" rows={2} className={fieldClass} defaultValue={expense?.notes ?? ''} />
        </div>
        <div className="space-y-1.5">
          <label className="fyh-label" htmlFor="attachment">Receipt / document</label>
          <Input
            id="attachment"
            name="attachment"
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
          />
          <p className="text-xs text-fyh-text-muted">PDF or image, max 10 MB</p>
        </div>
      </section>

      {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-fyh-success">{state.success}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : isEdit ? 'Update expense' : 'Save expense'}
      </Button>
    </form>
  );
}
