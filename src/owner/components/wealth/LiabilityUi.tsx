'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import {
  createLiabilityAction,
  payLiabilityAction,
  type WealthActionState,
} from '@/src/owner/actions/wealth';
import { AmountWithWords } from '@/src/owner/components/ui/AmountWithWords';
import { MoneyInput } from '@/src/owner/components/ui/MoneyInput';

const LIABILITY_TYPES = [
  'EMI',
  'INTEREST_ONLY',
  'DAILY_INTEREST',
  'MONTHLY_INTEREST',
  'FIXED_SCHEDULE',
  'CUSTOM',
] as const;

export function LiabilityFormUi() {
  const [state, formAction, pending] = useActionState<WealthActionState, FormData>(
    createLiabilityAction,
    {},
  );

  return (
    <div className="oo-page-stack mx-auto max-w-2xl">
      <header>
        <h1 className="oo-page-title">Add liability</h1>
        <p className="oo-page-subtitle">Loans, EMIs, and debt linked to properties.</p>
      </header>
      <form action={formAction} className="oo-form-section oo-form-grid">
        <input name="name" placeholder="Loan name" required className="oo-form-input" />
        <input name="lender" placeholder="Lender" className="oo-form-input" />
        <select name="liabilityType" className="oo-form-input">
          {LIABILITY_TYPES.map((t) => (
            <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>
          ))}
        </select>
        <MoneyInput
          name="originalPrincipalRupees"
          label="Original principal (₹)"
          required
        />
        <MoneyInput name="currentPrincipalRupees" label="Current principal (₹)" />
        <input
          name="interestRatePct"
          type="number"
          step="0.01"
          placeholder="Interest rate %"
          className="oo-form-input"
        />
        <input name="tenureMonths" type="number" placeholder="Tenure (months)" className="oo-form-input" />
        <input name="startDate" type="date" className="oo-form-input" />
        <MoneyInput name="fixedPaymentRupees" label="EMI / fixed payment (₹)" />
        <input name="assetId" placeholder="Linked asset ID (optional)" className="oo-form-input" />
        <div className="oo-form-actions col-span-full">
          <button type="submit" disabled={pending} className="oo-btn-primary">
            Create loan
          </button>
          <Link href="/liabilities" className="oo-btn-secondary">Cancel</Link>
        </div>
        {state.error ? <p className="text-sm text-red-400 col-span-full">{state.error}</p> : null}
      </form>
    </div>
  );
}

type AccountOption = { id: string; name: string };

type PaymentRow = {
  id: string;
  entryDate: string;
  description: string;
  eventType: string;
  amountPaise: number;
  category: string | null;
  principalPaise: number;
  interestPaise: number;
};

export function LiabilityDetailUi({
  liability,
  due,
  accounts,
  payments,
  totalPrincipalPaidPaise,
  totalInterestPaidPaise,
}: {
  liability: {
    id: string;
    name: string;
    lender: string | null;
    liabilityType: string;
    currentPrincipalPaise: number;
    originalPrincipalPaise: number;
    interestRateBps: number;
  };
  due: {
    principalDuePaise: number;
    interestDuePaise: number;
    totalDuePaise: number;
    dueDate: string | null;
  } | null;
  accounts: AccountOption[];
  payments: PaymentRow[];
  totalPrincipalPaidPaise: number;
  totalInterestPaidPaise: number;
}) {
  const [state, formAction, pending] = useActionState<WealthActionState, FormData>(
    payLiabilityAction,
    {},
  );

  const suggestedPayment =
    due && due.totalDuePaise > 0 ? (due.totalDuePaise / 100).toFixed(2) : '';

  return (
    <div className="oo-page-stack">
      <header>
        <h1 className="oo-page-title">{liability.name}</h1>
        <p className="oo-page-subtitle">
          {liability.lender ?? liability.liabilityType.replaceAll('_', ' ')} ·{' '}
          {(liability.interestRateBps / 100).toFixed(2)}% interest
        </p>
      </header>

      <section className="oo-card oo-card-liability p-4">
        <h2 className="oo-form-section-title">What you owe</h2>
        <div className="oo-stat-grid mt-2">
          <div>
            <p className="oo-label">Outstanding principal</p>
            <p className="oo-money-primary mt-1 oo-value-expense">
              <AmountWithWords paise={liability.currentPrincipalPaise} />
            </p>
          </div>
          <div>
            <p className="oo-label">Interest accrued / due</p>
            <p className="oo-money-primary mt-1 oo-value-expense">
              <AmountWithWords paise={due?.interestDuePaise ?? 0} />
            </p>
          </div>
          <div>
            <p className="oo-label">Total due now</p>
            <p className="oo-money-hero mt-1 oo-value-expense">
              <AmountWithWords paise={due?.totalDuePaise ?? 0} />
            </p>
          </div>
        </div>
        {due?.dueDate ? (
          <p className="oo-meta mt-3">
            Next due date: <span className="text-white">{due.dueDate}</span>
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-4">
          <p className="oo-meta">
            Principal paid: <span className="text-white"><AmountWithWords paise={totalPrincipalPaidPaise} /></span>
          </p>
          <p className="oo-meta">
            Interest paid: <span className="text-white"><AmountWithWords paise={totalInterestPaidPaise} /></span>
          </p>
        </div>
      </section>

      <section className="oo-form-section">
        <h2 className="oo-form-section-title">Pay loan</h2>
        <p className="oo-form-hint">
          Interest posts as expense. Principal reduces liability only — never counted as expense.
        </p>
        <form action={formAction} className="oo-form-grid mt-3">
          <input type="hidden" name="liabilityId" value={liability.id} />
          <MoneyInput
            name="amountRupees"
            label="Payment amount (₹)"
            defaultValue={Number(suggestedPayment) || 0}
            required
          />
          <input
            name="paymentDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="oo-form-input"
          />
          <select name="accountId" className="oo-form-input">
            <option value="">Payment account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select name="allocationMode" className="oo-form-input" defaultValue="AUTO">
            <option value="AUTO">Auto split principal / interest</option>
            <option value="MANUAL">Manual split</option>
          </select>
          <MoneyInput
            name="manualInterestRupees"
            label="Manual interest (₹)"
            className="oo-form-input"
          />
          <MoneyInput
            name="manualPrincipalRupees"
            label="Manual principal (₹)"
            className="oo-form-input"
          />
          <button type="submit" disabled={pending} className="oo-btn-primary min-h-[2.75rem]">
            {pending ? 'Processing…' : 'PAY'}
          </button>
        </form>
        {state.error ? <p className="mt-2 text-sm text-red-400">{state.error}</p> : null}
        {state.success ? <p className="mt-2 text-sm text-emerald-400">{state.success}</p> : null}
      </section>

      {payments.length > 0 ? (
        <section>
          <h2 className="oo-section-title-strong mb-3">Payment history</h2>
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="oo-card flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{p.description}</p>
                  <p className="oo-meta">
                    {p.entryDate}
                    {p.principalPaise > 0 ? (
                      <>
                        {' · Principal '}
                        <AmountWithWords paise={p.principalPaise} />
                      </>
                    ) : null}
                    {p.interestPaise > 0 ? (
                      <>
                        {' · Interest '}
                        <AmountWithWords paise={p.interestPaise} />
                      </>
                    ) : null}
                  </p>
                </div>
                <p className="oo-money-secondary shrink-0"><AmountWithWords paise={p.amountPaise} /></p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
