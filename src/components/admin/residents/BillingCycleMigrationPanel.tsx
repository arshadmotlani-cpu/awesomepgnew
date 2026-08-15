'use client';

import { useActionState, useId } from 'react';
import {
  applyBillingCycleMigrationAction,
  generateBillingCycleTransitionInvoiceAction,
  type BillingCycleMigrationActionState,
} from '@/app/(admin)/admin/residents/[customerId]/actions';
import { AdminConfirmSubmit } from '@/src/components/admin/AdminConfirmSubmit';
import type { BillingCycleMigrationPreview } from '@/src/services/billingCycleMigration';

function formatInr(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function policyLabel(policy: string): string {
  return policy === 'calendar_month_1st' ? '1st of month (calendar)' : 'Anniversary (check-in day)';
}

export function BillingCycleMigrationPanel({
  bookingId,
  customerId,
  preview,
}: {
  bookingId: string;
  customerId: string;
  preview: BillingCycleMigrationPreview;
}) {
  const applyFormId = useId().replace(/:/g, '');
  const transitionFormId = useId().replace(/:/g, '');

  const [applyState, applyAction, applyPending] = useActionState(
    applyBillingCycleMigrationAction,
    { ok: false } satisfies BillingCycleMigrationActionState,
  );
  const [transitionState, transitionAction, transitionPending] = useActionState(
    generateBillingCycleTransitionInvoiceAction,
    { ok: false } satisfies BillingCycleMigrationActionState,
  );

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <div>
        <h3 className="text-sm font-semibold text-white">Billing cycle migration</h3>
        <p className="mt-1 text-xs text-apg-silver">
          Move resident to 1st-of-month billing. Check-in date and paid historical invoices are
          never changed.
        </p>
      </div>

      {preview.alreadyOnTarget ? (
        <p className="text-sm text-emerald-300">Already on 1st-of-month billing.</p>
      ) : null}

      {preview.blocked ? (
        <p className="text-sm text-rose-300">{preview.blockedReason}</p>
      ) : null}

      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-apg-silver">Current cycle</dt>
          <dd className="font-medium text-white">
            Day {preview.currentBillingDay} · {policyLabel(preview.currentPolicy)}
          </dd>
        </div>
        <div>
          <dt className="text-apg-silver">Target</dt>
          <dd className="font-medium text-white">
            Day {preview.targetBillingDay} · {policyLabel(preview.targetPolicy)}
          </dd>
        </div>
        <div>
          <dt className="text-apg-silver">Check-in (unchanged)</dt>
          <dd className="font-medium text-white">{preview.checkInDate}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Monthly rent</dt>
          <dd className="font-medium text-white">{formatInr(preview.monthlyRentPaise)}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Paid through</dt>
          <dd className="font-medium text-white">{preview.paidThroughDate ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Outstanding rent</dt>
          <dd className="font-medium text-white">{formatInr(preview.outstandingRentPaise)}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Deposit held</dt>
          <dd className="font-medium text-white">{formatInr(preview.depositHeldPaise)}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">First auto bill after migration</dt>
          <dd className="font-medium text-white">{preview.firstAutoBillingDate}</dd>
        </div>
      </dl>

      {preview.lightweightPolicyFlip ? (
        <p className="text-xs text-amber-200">
          Check-in was on the 1st — policy flip only; no transition bill needed if coverage is
          continuous.
        </p>
      ) : null}

      {preview.transition ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
          <p className="font-medium text-white">Transition preview</p>
          <p className="mt-1 text-apg-silver">
            {formatInr(preview.transition.amountPaise)} covering{' '}
            {preview.transition.periodStart} → {preview.transition.periodEnd} (
            {preview.transition.daysActive}/{preview.transition.daysInMonth} days)
          </p>
          <p className="mt-1 text-apg-silver">{preview.transition.explanation}</p>
        </div>
      ) : null}

      {!preview.alreadyOnTarget && !preview.blocked ? (
        <div className="flex flex-wrap gap-3">
          {preview.transition && !preview.lightweightPolicyFlip ? (
            <form id={transitionFormId} action={transitionAction} className="inline">
              <input type="hidden" name="bookingId" value={bookingId} />
              <input type="hidden" name="customerId" value={customerId} />
              <AdminConfirmSubmit
                formId={transitionFormId}
                title="Generate transition bill?"
                description="Creates an adhoc rent invoice for the prorated gap before calendar-month billing."
                confirmLabel="Generate bill"
                pending={transitionPending}
                className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5"
              >
                Generate transition bill
              </AdminConfirmSubmit>
            </form>
          ) : null}

          <form id={applyFormId} action={applyAction} className="inline space-y-2">
            <input type="hidden" name="bookingId" value={bookingId} />
            <input type="hidden" name="customerId" value={customerId} />
            <label className="block text-xs">
              <span className="text-apg-silver">Migration note</span>
              <input
                type="text"
                name="note"
                maxLength={200}
                placeholder="Optional note for audit log"
                className="apg-admin-field mt-1 w-full max-w-md rounded-lg border border-white/10 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-apg-silver">
              <input
                type="checkbox"
                name="createTransitionInvoice"
                value="1"
                defaultChecked={false}
              />
              Also create transition bill on apply
            </label>
            <AdminConfirmSubmit
              formId={applyFormId}
              title="Apply billing cycle migration?"
              description="Sets calendar-month policy and billing day 1. Open invoices are realigned. Historical paid invoices are not modified."
              confirmLabel="Apply migration"
              pending={applyPending}
              className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
            >
              Apply migration
            </AdminConfirmSubmit>
          </form>
        </div>
      ) : null}

      {applyState.error ? <p className="text-xs text-rose-300">{applyState.error}</p> : null}
      {applyState.ok ? (
        <p className="text-xs text-emerald-300">
          Billing cycle migrated.
          {applyState.transitionInvoiceId ? ` Transition invoice created.` : ''}
        </p>
      ) : null}
      {transitionState.error ? <p className="text-xs text-rose-300">{transitionState.error}</p> : null}
      {transitionState.ok && transitionState.invoiceId ? (
        <p className="text-xs text-emerald-300">Transition invoice created.</p>
      ) : null}
    </div>
  );
}
