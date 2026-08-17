'use client';

import { useActionState } from 'react';
import { Plus } from 'lucide-react';
import {
  createExpenseAction,
  deleteExpenseAction,
  type ExpenseActionState,
} from '@/src/hair/actions/expenses';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhExpense } from '@/src/hair/db/schema';
import {
  FYH_EXPENSE_CATEGORIES,
  FYH_EXPENSE_CATEGORY_LABELS,
  FYH_EXPENSE_PAYMENT_LABELS,
  FYH_EXPENSE_PAYMENT_METHODS,
} from '@/src/hair/lib/expenseCategories';
import { formatInrFromPaise } from '@/src/hair/lib/money';

const initialState: ExpenseActionState = {};
const fieldClass =
  'fyh-input w-full text-[0.8125rem] outline-none focus:border-fyh-accent/50';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpensesPageUi({
  expenses,
  staffName,
  showForm,
}: {
  expenses: FyhExpense[];
  staffName: string;
  showForm?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">Finance</p>
          <h1 className="fyh-display mt-1 font-semibold">Expenses</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Record salon operating expenses
          </p>
        </div>
        {!showForm ? (
          <a href="#add-expense">
            <Button type="button">
              <Plus className="mr-2 h-4 w-4" />
              Add expense
            </Button>
          </a>
        ) : null}
      </div>

      {showForm ? (
        <div id="add-expense">
          <ExpenseForm staffName={staffName} />
        </div>
      ) : (
        <div id="add-expense" className="fyh-glass p-5">
          <ExpenseForm staffName={staffName} />
        </div>
      )}

      <div className="fyh-glass overflow-hidden">
        {expenses.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-fyh-text-muted">
            No expenses recorded yet.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Date</th>
                <th>Title</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Staff</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {expenses.map((e) => (
                <ExpenseRow key={e.id} expense={e} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ExpenseRow({ expense }: { expense: FyhExpense }) {
  const [state, action, pending] = useActionState(deleteExpenseAction, initialState);
  const categoryLabel =
    FYH_EXPENSE_CATEGORY_LABELS[expense.category as keyof typeof FYH_EXPENSE_CATEGORY_LABELS] ??
    expense.category;
  const paymentLabel =
    FYH_EXPENSE_PAYMENT_LABELS[
      expense.paymentMethod as keyof typeof FYH_EXPENSE_PAYMENT_LABELS
    ] ?? expense.paymentMethod;

  return (
    <tr>
      <td className="px-4 py-3 tabular-nums text-fyh-text-muted">{expense.expenseDate}</td>
      <td className="px-4 py-3 font-medium">{expense.title}</td>
      <td className="px-4 py-3 text-fyh-text-muted">{categoryLabel}</td>
      <td className="px-4 py-3 tabular-nums">{formatInrFromPaise(expense.amountPaise)}</td>
      <td className="px-4 py-3 text-fyh-text-muted">{paymentLabel}</td>
      <td className="px-4 py-3 text-fyh-text-muted">{expense.staffName}</td>
      <td className="px-4 py-3 text-right">
        <form action={action}>
          <input type="hidden" name="id" value={expense.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={pending}>
            Delete
          </Button>
        </form>
        {state.error ? <p className="text-xs text-fyh-danger">{state.error}</p> : null}
      </td>
    </tr>
  );
}

export function ExpenseForm({ staffName }: { staffName: string }) {
  const [state, formAction, pending] = useActionState(createExpenseAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <h2 className="text-lg font-semibold">Add expense</h2>
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
          <Input id="expenseDate" name="expenseDate" type="date" required defaultValue={todayIso()} />
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
          <Input id="staffName" name="staffName" value={staffName} readOnly className="bg-black/20" />
        </div>
      </div>

      {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save expense'}
      </Button>
    </form>
  );
}
