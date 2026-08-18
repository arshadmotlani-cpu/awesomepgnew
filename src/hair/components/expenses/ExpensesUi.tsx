'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  deleteExpenseAction,
  type ExpenseActionState,
} from '@/src/hair/actions/expenses';
import { NewExpenseModal } from '@/src/hair/components/expenses/NewExpenseModal';
import { Button } from '@/src/hair/components/ui/button';
import type { FyhExpense } from '@/src/hair/db/schema';
import {
  FYH_EXPENSE_CATEGORY_LABELS,
  FYH_EXPENSE_PAYMENT_LABELS,
} from '@/src/hair/lib/expenseCategories';
import { formatInrFromPaise } from '@/src/hair/lib/money';

const initialState: ExpenseActionState = {};

export function ExpensesPageUi({
  expenses,
  staffName,
}: {
  expenses: FyhExpense[];
  staffName: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);

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
        <Button type="button" onClick={() => setModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add expense
        </Button>
      </div>

      <NewExpenseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        staffName={staffName}
      />

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
