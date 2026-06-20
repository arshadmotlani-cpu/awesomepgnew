import { ApgCard } from '@/src/components/customer/design-system';
import { DepositRefundRequestForm } from '@/src/components/customer/account/DepositRefundRequestForm';
import { BillingRulesCallout } from '@/src/components/customer/account/v2/BillingRulesCallout';
import { paiseToInr } from '@/src/lib/format';
import { DEPOSIT_REFUND_RULE_COPY } from '@/src/lib/residents/stayBillingRules';

type Props = {
  bookingId: string;
  depositPaidPaise: number;
  depositHeldPaise: number;
  depositRefundablePaise: number;
  depositOutstandingPaise: number;
  depositStatusLabel: string;
  showRefundForm: boolean;
};

export function DepositRefundModule({
  bookingId,
  depositPaidPaise,
  depositHeldPaise,
  depositRefundablePaise,
  depositOutstandingPaise,
  depositStatusLabel,
  showRefundForm,
}: Props) {
  return (
    <section id="deposit" className="scroll-mt-24">
      <ApgCard tier="account" className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Deposit</h2>
        <p className="mt-1 text-sm text-zinc-600">Security deposit held until move-out.</p>

        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <dt className="text-xs font-semibold uppercase text-zinc-500">Deposit paid</dt>
            <dd className="mt-1 text-lg font-bold text-zinc-900">{paiseToInr(depositPaidPaise)}</dd>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <dt className="text-xs font-semibold uppercase text-zinc-500">Status</dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-900">{depositStatusLabel}</dd>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <dt className="text-xs font-semibold uppercase text-zinc-500">Outstanding</dt>
            <dd className="mt-1 text-lg font-bold text-zinc-900">
              {paiseToInr(depositOutstandingPaise)}
            </dd>
          </div>
        </dl>

        {depositRefundablePaise > 0 ? (
          <p className="mt-3 text-sm text-indigo-800">
            Refundable balance: <strong>{paiseToInr(depositRefundablePaise)}</strong>
          </p>
        ) : null}

        {depositOutstandingPaise > 0 ? (
          <p className="mt-4 text-sm text-amber-800">
            Deposit due: {paiseToInr(depositOutstandingPaise)} — pay from the billing section or
            invoice list above.
          </p>
        ) : null}

        {showRefundForm && depositRefundablePaise > 0 ? (
          <div className="mt-6 space-y-4 border-t border-zinc-200 pt-6">
            <h3 className="text-sm font-semibold text-zinc-900">Request refund</h3>
            <p className="text-xs text-zinc-600">
              Upload a final electricity meter photo, or use average room billing if unavailable.
            </p>
            <p className="text-xs text-zinc-500">{DEPOSIT_REFUND_RULE_COPY}</p>
            <DepositRefundRequestForm
              bookingId={bookingId}
              refundableBalancePaise={depositRefundablePaise}
            />
          </div>
        ) : null}

        <div className="mt-5">
          <BillingRulesCallout compact />
        </div>
      </ApgCard>
    </section>
  );
}
