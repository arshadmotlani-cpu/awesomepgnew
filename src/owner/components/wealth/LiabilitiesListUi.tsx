'use client';

import Link from 'next/link';
import { AmountWithWords } from '@/src/owner/components/ui/AmountWithWords';

type LiabilityRow = {
  id: string;
  name: string;
  lender: string | null;
  liabilityType: string;
  currentPrincipalPaise: number;
  interestDuePaise: number;
  totalDuePaise: number;
  dueDate: string | null;
};

export function LiabilitiesListUi({ liabilities }: { liabilities: LiabilityRow[] }) {
  const totalPrincipal = liabilities.reduce((s, l) => s + l.currentPrincipalPaise, 0);
  const totalInterest = liabilities.reduce((s, l) => s + l.interestDuePaise, 0);
  const dueThisMonth = liabilities.reduce((s, l) => s + l.totalDuePaise, 0);

  return (
    <div className="space-y-5 md:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="oo-page-title">Liabilities</h1>
          <p className="oo-page-subtitle">
            Loans with interest accrual and principal/interest split on each payment.
          </p>
        </div>
        <Link href="/liabilities/new" className="oo-btn-primary w-full sm:w-auto shrink-0">
          Add loan
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="oo-card oo-card-compact oo-card-liability">
          <p className="oo-label">Total principal</p>
          <p className="oo-money-primary mt-1"><AmountWithWords paise={totalPrincipal} /></p>
        </div>
        <div className="oo-card oo-card-compact oo-card-liability">
          <p className="oo-label">Interest outstanding</p>
          <p className="oo-money-primary mt-1"><AmountWithWords paise={totalInterest} /></p>
        </div>
        <div className="oo-card oo-card-compact">
          <p className="oo-label">Due now (all loans)</p>
          <p className="oo-money-primary mt-1"><AmountWithWords paise={dueThisMonth} /></p>
        </div>
      </div>

      {liabilities.length === 0 ? (
        <div className="oo-empty-state">
          <p className="text-base font-semibold text-white">No liabilities yet</p>
          <p className="oo-page-subtitle mt-2">
            Add a loan to track principal, interest, and payment history.
          </p>
          <Link href="/liabilities/new" className="oo-btn-primary mt-4 inline-flex">
            Add loan
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {liabilities.map((l) => (
            <Link
              key={l.id}
              href={`/liabilities/${l.id}`}
              className="oo-card block p-4 transition hover:border-[#FF5A1F]/35"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-white">{l.name}</p>
                  <p className="oo-meta mt-1">
                    {l.lender ?? l.liabilityType.replaceAll('_', ' ')}
                    {l.dueDate ? ` · Due ${l.dueDate}` : ''}
                  </p>
                </div>
                <p className="oo-money-secondary shrink-0"><AmountWithWords paise={l.currentPrincipalPaise} /></p>
              </div>
              {l.totalDuePaise > 0 ? (
                <p className="oo-meta mt-2 text-amber-200/90">
                  Payment due: <AmountWithWords paise={l.totalDuePaise} />
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
