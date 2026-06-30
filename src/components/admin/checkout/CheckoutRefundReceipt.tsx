import Link from 'next/link';
import { formatDateTime, paiseToInr } from '@/src/lib/format';
import {
  buildCheckoutRefundReceiptData,
  formatReceiptDeduction,
  type CheckoutRefundReceiptData,
} from '@/src/lib/checkout/checkoutRefundReceipt';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

export function CheckoutRefundReceipt({
  data,
  compact = false,
}: {
  data: CheckoutRefundReceiptData;
  compact?: boolean;
}) {
  return (
    <section
      className={
        compact
          ? 'rounded-2xl bg-[#1A1F27]/80 p-5 ring-1 ring-white/[0.06]'
          : 'rounded-3xl bg-[#1A1F27]/90 p-8 ring-1 ring-white/[0.06]'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-apg-silver">
            Refund receipt
          </p>
          <h3 className="mt-1 text-xl font-semibold text-white">{data.residentName}</h3>
          <p className="mt-1 text-sm text-apg-silver">
            {data.pgName} · Room {data.roomNumber} · {data.bedCode}
          </p>
        </div>
        {data.isComplete ? (
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-200">
            Completed
          </span>
        ) : (
          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-200">
            In progress
          </span>
        )}
      </div>

      <dl className="mt-6 space-y-2 text-sm">
        <ReceiptRow label="Booking" value={data.bookingCode} mono />
        <ReceiptRow label="Deposit held" value={paiseToInr(data.depositPaise)} />
        <ReceiptRow label="Notice deduction" value={formatReceiptDeduction(data.noticeDeductionPaise)} />
        <ReceiptRow
          label="Electricity deduction"
          value={formatReceiptDeduction(data.electricityDeductionPaise)}
        />
        <ReceiptRow label="Damage" value={formatReceiptDeduction(data.damagePaise)} />
        <ReceiptRow label="Other deductions" value={formatReceiptDeduction(data.otherDeductionsPaise)} />
      </dl>

      <div className="my-5 border-t border-white/[0.08]" />

      <div className="flex items-end justify-between gap-4">
        <p className="text-sm font-medium text-apg-silver">Final refund</p>
        <p className="text-3xl font-semibold text-white">{paiseToInr(data.finalRefundPaise)}</p>
      </div>

      {data.refundReference ? (
        <p className="mt-4 text-sm text-apg-silver">
          UPI reference:{' '}
          <span className="font-mono text-white">{data.refundReference}</span>
        </p>
      ) : null}

      {data.completedAt ? (
        <p className="mt-2 text-xs text-apg-silver">
          {data.completedByLabel ? `${data.completedByLabel} · ` : ''}
          {formatDateTime(data.completedAt)}
        </p>
      ) : null}

      <Link
        href={`/admin/checkout-settlements/${data.settlementId}`}
        className="mt-5 inline-block text-sm font-medium text-[#FF5A1F] hover:underline"
      >
        Open checkout →
      </Link>
    </section>
  );
}

export function CheckoutRefundReceiptFromDetail({
  detail,
  completedByLabel,
  compact,
}: {
  detail: CheckoutSettlementDetail;
  completedByLabel?: string | null;
  compact?: boolean;
}) {
  return (
    <CheckoutRefundReceipt
      data={buildCheckoutRefundReceiptData(detail, completedByLabel)}
      compact={compact}
    />
  );
}

function ReceiptRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-apg-silver">{label}</dt>
      <dd className={mono ? 'font-mono text-white' : 'font-medium text-white'}>{value}</dd>
    </div>
  );
}
