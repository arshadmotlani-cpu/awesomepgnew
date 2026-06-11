import {
  DEPOSIT_REFUND_BLOCKERS,
  DEPOSIT_REFUND_HEADLINE,
  DEPOSIT_REFUND_TIMING,
} from '@/src/lib/depositPolicy';

export function DepositRefundNotice({
  variant = 'default',
}: {
  variant?: 'default' | 'compact';
}) {
  if (variant === 'compact') {
    return (
      <p className="text-xs leading-relaxed text-zinc-500">
        {DEPOSIT_REFUND_HEADLINE} {DEPOSIT_REFUND_TIMING} {DEPOSIT_REFUND_BLOCKERS}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <p className="font-semibold">{DEPOSIT_REFUND_HEADLINE}</p>
      <p className="mt-1">{DEPOSIT_REFUND_TIMING}</p>
      <p className="mt-1 text-emerald-800">{DEPOSIT_REFUND_BLOCKERS}</p>
    </div>
  );
}
