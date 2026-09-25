'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useActionState, useMemo, useState } from 'react';
import { Paperclip, Pencil, Plus, XCircle } from 'lucide-react';
import {
  cancelExpenseAction,
  type ExpenseActionState,
} from '@/src/hair/actions/expenses';
import { NewExpenseModal } from '@/src/hair/components/expenses/NewExpenseModal';
import { ExpenseForm, type StaffOption } from '@/src/hair/components/expenses/ExpenseForm';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhExpense } from '@/src/hair/db/schema';
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
  FYH_EXPENSE_SOURCE_LABELS,
} from '@/src/hair/lib/expenseFields';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { ExpenseListResult } from '@/src/hair/services/expenses';

const initialState: ExpenseActionState = {};
const fieldClass = 'fyh-input w-full text-[0.8125rem]';

function attachmentHref(expense: FyhExpense): string | null {
  if (!expense.attachmentUrl) return null;
  return `/api/hair/expense-files?expenseId=${encodeURIComponent(expense.id)}&url=${encodeURIComponent(expense.attachmentUrl)}`;
}

export function ExpensesPageUi({
  list,
  staffName,
  staffOptions,
  staffNameById,
  canAdd,
  canEdit,
}: {
  list: ExpenseListResult;
  staffName: string;
  staffOptions: StaffOption[];
  staffNameById: Record<string, string>;
  canAdd: boolean;
  canEdit: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<FyhExpense | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const replaceParams = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const filterDefaults = useMemo(
    () => ({
      q: searchParams.get('q') ?? '',
      from: searchParams.get('from') ?? '',
      to: searchParams.get('to') ?? '',
      category: searchParams.get('category') ?? '',
      expenseFor: searchParams.get('expenseFor') ?? '',
      paidBy: searchParams.get('paidBy') ?? '',
      paymentMethod: searchParams.get('paymentMethod') ?? '',
      staff: searchParams.get('staff') ?? '',
      source: searchParams.get('source') ?? '',
    }),
    [searchParams],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">Finance</p>
          <h1 className="fyh-display mt-1 font-semibold">General expenses</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Operating expenses (salary is managed separately)
          </p>
        </div>
        {canAdd ? (
          <Button type="button" onClick={() => setModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add expense
          </Button>
        ) : null}
      </div>

      <div className="fyh-glass space-y-3 p-4">
        <form
          className="grid gap-2 md:grid-cols-4 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            replaceParams({
              q: String(fd.get('q') || ''),
              from: String(fd.get('from') || ''),
              to: String(fd.get('to') || ''),
              category: String(fd.get('category') || ''),
              expenseFor: String(fd.get('expenseFor') || ''),
              paidBy: String(fd.get('paidBy') || ''),
              paymentMethod: String(fd.get('paymentMethod') || ''),
              staff: String(fd.get('staff') || ''),
              source: String(fd.get('source') || ''),
              page: '1',
            });
          }}
        >
          <Input name="q" placeholder="Search…" defaultValue={filterDefaults.q} className="md:col-span-2" />
          <Input name="from" type="date" defaultValue={filterDefaults.from} aria-label="From date" />
          <Input name="to" type="date" defaultValue={filterDefaults.to} aria-label="To date" />
          <select name="category" className={fieldClass} defaultValue={filterDefaults.category}>
            <option value="">All categories</option>
            {FYH_MANUAL_GENERAL_EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{FYH_EXPENSE_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <select name="expenseFor" className={fieldClass} defaultValue={filterDefaults.expenseFor}>
            <option value="">Expense for</option>
            {FYH_EXPENSE_FOR.map((v) => (
              <option key={v} value={v}>{FYH_EXPENSE_FOR_LABELS[v]}</option>
            ))}
          </select>
          <select name="paidBy" className={fieldClass} defaultValue={filterDefaults.paidBy}>
            <option value="">Paid by</option>
            {FYH_EXPENSE_PAID_BY.map((v) => (
              <option key={v} value={v}>{FYH_EXPENSE_PAID_BY_LABELS[v]}</option>
            ))}
          </select>
          <select name="paymentMethod" className={fieldClass} defaultValue={filterDefaults.paymentMethod}>
            <option value="">Payment mode</option>
            {FYH_EXPENSE_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{FYH_EXPENSE_PAYMENT_LABELS[m]}</option>
            ))}
          </select>
          <select name="staff" className={fieldClass} defaultValue={filterDefaults.staff}>
            <option value="">Staff payer</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select name="source" className={fieldClass} defaultValue={filterDefaults.source}>
            <option value="">Source</option>
            <option value="manual">Manual</option>
            <option value="purchase">Purchase</option>
          </select>
          <Button type="submit" variant="secondary" className="md:col-span-2">Apply filters</Button>
        </form>
        <p className="text-sm font-medium tabular-nums">
          Total (filtered): {formatInrFromPaise(list.totalGeneralPaise)}
        </p>
      </div>

      <NewExpenseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        staffName={staffName}
        staffOptions={staffOptions}
      />

      {editExpense ? (
        <div className="fyh-modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditExpense(null)}>
          <div className="fyh-modal-panel sm:max-w-lg" role="dialog" aria-modal="true">
            <header className="fyh-modal-header flex justify-between gap-2">
              <h2 className="fyh-modal-title">Edit expense</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditExpense(null)}>Close</Button>
            </header>
            <div className="fyh-modal-body">
              <ExpenseForm
                staffName={staffName}
                staffOptions={staffOptions}
                expense={editExpense}
                onSaved={() => setEditExpense(null)}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="fyh-glass overflow-x-auto">
        {list.rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-fyh-text-muted">No expenses match your filters.</div>
        ) : (
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="text-fyh-text-muted">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">For</th>
                <th className="px-3 py-2">Paid by</th>
                <th className="px-3 py-2">Staff</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Bill</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {list.rows.map((e) => (
                <ExpenseRow
                  key={e.id}
                  expense={e}
                  staffLabel={e.staffEmployeeId ? staffNameById[e.staffEmployeeId] ?? '—' : '—'}
                  canEdit={canEdit}
                  onEdit={() => setEditExpense(e)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {list.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-fyh-text-muted">
            Page {list.page} of {list.totalPages} ({list.totalCount} rows)
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={list.page <= 1}
              onClick={() => replaceParams({ page: String(list.page - 1) })}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={list.page >= list.totalPages}
              onClick={() => replaceParams({ page: String(list.page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ExpenseRow({
  expense,
  staffLabel,
  canEdit,
  onEdit,
}: {
  expense: FyhExpense;
  staffLabel: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const [state, action, pending] = useActionState(cancelExpenseAction, initialState);
  const categoryLabel =
    FYH_EXPENSE_CATEGORY_LABELS[expense.category as keyof typeof FYH_EXPENSE_CATEGORY_LABELS] ??
    expense.category;
  const paymentLabel =
    FYH_EXPENSE_PAYMENT_LABELS[expense.paymentMethod as keyof typeof FYH_EXPENSE_PAYMENT_LABELS] ??
    expense.paymentMethod;
  const forLabel = expense.expenseFor
    ? FYH_EXPENSE_FOR_LABELS[expense.expenseFor as keyof typeof FYH_EXPENSE_FOR_LABELS]
    : '—';
  const paidByLabel = expense.paidBy
    ? FYH_EXPENSE_PAID_BY_LABELS[expense.paidBy as keyof typeof FYH_EXPENSE_PAID_BY_LABELS]
    : '—';
  const source = expense.source ?? (expense.purchaseId ? 'purchase' : 'manual');
  const sourceLabel = FYH_EXPENSE_SOURCE_LABELS[source as keyof typeof FYH_EXPENSE_SOURCE_LABELS] ?? source;
  const fileHref = attachmentHref(expense);
  const isPurchase = source === 'purchase' || Boolean(expense.purchaseId);
  const editable = canEdit && !isPurchase && expense.status === 'active';

  return (
    <tr>
      <td className="px-3 py-2 tabular-nums text-fyh-text-muted">{expense.expenseDate}</td>
      <td className="px-3 py-2 font-medium">{expense.title}</td>
      <td className="px-3 py-2 text-fyh-text-muted">{categoryLabel}</td>
      <td className="px-3 py-2 text-fyh-text-muted">{forLabel}</td>
      <td className="px-3 py-2 text-fyh-text-muted">{paidByLabel}</td>
      <td className="px-3 py-2 text-fyh-text-muted">{staffLabel}</td>
      <td className="px-3 py-2 text-fyh-text-muted">{paymentLabel}</td>
      <td className="px-3 py-2 tabular-nums">{formatInrFromPaise(expense.amountPaise)}</td>
      <td className="px-3 py-2 text-fyh-text-muted">{expense.billNumber ?? '—'}</td>
      <td className="px-3 py-2 text-fyh-text-muted">{expense.companyName ?? '—'}</td>
      <td className="px-3 py-2">
        {fileHref ? (
          <a href={fileHref} target="_blank" rel="noreferrer" className="inline-flex text-fyh-accent" aria-label="View attachment">
            <Paperclip className="h-4 w-4" />
          </a>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2 text-fyh-text-muted">
        {isPurchase && expense.purchaseId ? (
          <Link href={`/purchases/${expense.purchaseId}`} className="text-fyh-accent hover:underline">
            {sourceLabel}
          </Link>
        ) : (
          sourceLabel
        )}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {editable ? (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <form action={action} className="inline">
              <input type="hidden" name="id" value={expense.id} />
              <Button type="submit" variant="ghost" size="sm" disabled={pending} aria-label="Cancel expense">
                <XCircle className="h-4 w-4 text-fyh-danger" />
              </Button>
            </form>
          </>
        ) : null}
        {state.error ? <p className="text-xs text-fyh-danger">{state.error}</p> : null}
      </td>
    </tr>
  );
}
