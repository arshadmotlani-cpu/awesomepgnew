'use client';

import { useActionState, useState } from 'react';
import { markPayrollPaidAction, type PayrollActionState } from '@/src/workforce/actions/payroll';
import type { PayrollLineDetail } from '@/src/workforce/services/payroll';
import { formatInrFromPaise } from '@/src/hair/lib/money';

function inr(paise: number) {
  return formatInrFromPaise(paise);
}

type Props = {
  line: PayrollLineDetail;
  monthLabel: string;
  ownerView?: boolean;
  canPay?: boolean;
  canViewQr?: boolean;
};

export function SalaryEmployeeCard({
  line,
  monthLabel,
  ownerView = true,
  canPay = false,
  canViewQr = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [state, formAction, pending] = useActionState(markPayrollPaidAction, {} as PayrollActionState);

  const allocated =
    line.paidLeaveAllocated != null ? String(line.paidLeaveAllocated) : '—';

  return (
    <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{line.fullName}</h2>
          <p className="mt-1 text-xs text-fyh-text-secondary">
            Working {line.eligibleWorkingDays} · Present {line.presentDays} · Absent {line.absentDays} ·
            Paid leave {line.paidLeaveDays}/{allocated}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-fyh-text-secondary">Net payable</p>
          <p className="text-lg font-semibold">{inr(line.netPaise)}</p>
        </div>
      </header>

      <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
        <p>Base salary: {inr(line.salaryPaise)}</p>
        <p>Absence deduction: {inr(line.deductionsPaise)}</p>
        <p>Incentive: {inr(line.incentivePaise + line.commissionPaise)}</p>
        <p>Extra / unpaid: {line.extraUnpaidAbsenceDays}</p>
      </div>

      {line.status === 'paid' && line.payment ? (
        <p className="mt-3 text-sm text-emerald-400">
          Paid {inr(line.payment.amountPaise)} on{' '}
          {new Date(line.payment.paidAt).toLocaleDateString('en-IN')}
          {line.payment.paidByName ? ` by ${line.payment.paidByName}` : ''}
          {line.payment.paymentReference ? ` · Ref ${line.payment.paymentReference}` : ''}
        </p>
      ) : ownerView ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded border border-[color:var(--fyh-border)] px-3 py-1.5 text-sm"
          >
            {expanded ? 'Hide detail' : 'View'}
          </button>
          {canPay ? (
            <button
              type="button"
              onClick={() => setShowPay((v) => !v)}
              className="rounded bg-fyh-accent px-3 py-1.5 text-sm font-medium text-black"
            >
              Pay
            </button>
          ) : null}
        </div>
      ) : null}

      {expanded ? (
        <div className="mt-3 border-t border-[color:var(--fyh-border)] pt-3 text-sm">
          <p className="font-medium">{monthLabel}</p>
          <p className="mt-2">Attendance — Present: {line.presentDays}, Absent: {line.absentDays}, Paid leave: {line.paidLeaveDays}, Working days: {line.eligibleWorkingDays}</p>
          <p className="mt-2">Salary — Base: {inr(line.salaryPaise)}, Deduction: {inr(line.deductionsPaise)}, Incentive: {inr(line.incentivePaise + line.commissionPaise)}, Net: {inr(line.netPaise)}</p>
          {line.notes ? <p className="mt-2 text-fyh-text-secondary">{line.notes}</p> : null}
        </div>
      ) : null}

      {showPay && ownerView && canPay && line.status !== 'paid' ? (
        <form action={formAction} className="mt-4 space-y-3 rounded-xl border border-[color:var(--fyh-border)] p-4">
          <input type="hidden" name="payrollLineId" value={line.lineId} />
          <p className="text-sm font-medium">Pay {line.fullName}</p>
          <p className="text-sm text-fyh-text-secondary">Salary for {monthLabel}</p>
          <p className="text-lg font-semibold">{inr(line.netPaise)}</p>
          {canViewQr ? (
            <>
              <p className="text-sm">
                UPI ID:{' '}
                <span className="font-medium">{line.upiId?.trim() || 'Not saved'}</span>
              </p>
              {line.qrCodeUrl ? (
                <button
                  type="button"
                  onClick={() => setShowQr(true)}
                  className="rounded border border-[color:var(--fyh-border)] px-3 py-1.5 text-sm"
                >
                  View QR
                </button>
              ) : (
                <p className="text-sm text-fyh-text-secondary">No salary payment QR saved.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-fyh-text-secondary">
              Payment details hidden — View Salary QR permission required.
            </p>
          )}
          <label className="block text-sm">
            Payment method
            <select
              name="paymentMethod"
              defaultValue="upi"
              className="mt-1 block w-full rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
            >
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          <label className="block text-sm">
            Payment reference / UTR
            <input
              name="paymentReference"
              placeholder="Optional reference"
              className="mt-1 block w-full rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-fyh-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Mark paid'}
          </button>
          {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-emerald-400">{state.success}</p> : null}
        </form>
      ) : null}

      {showQr && canViewQr && line.qrCodeUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowQr(false)}>
          <div className="max-w-sm rounded-2xl bg-[color:var(--fyh-surface)] p-4" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-medium">{line.fullName} — payment QR</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={line.qrCodeUrl} alt={`${line.fullName} payment QR`} className="mx-auto h-64 w-64 object-contain" />
            {line.upiId ? <p className="mt-3 text-center text-sm">UPI: {line.upiId}</p> : null}
            <button type="button" onClick={() => setShowQr(false)} className="mt-4 w-full rounded border border-[color:var(--fyh-border)] py-2 text-sm">
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
