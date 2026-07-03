import { formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import type { DepositRefundReceiptDocument } from '@/src/services/depositRefundReceipt';

export function DepositRefundReceiptDocument({
  document,
  variant = 'admin',
}: {
  document: DepositRefundReceiptDocument;
  variant?: 'admin' | 'print';
}) {
  const isPrint = variant === 'print';
  const shell = isPrint
    ? 'rounded-2xl border border-zinc-200 bg-white p-8 text-zinc-900'
    : 'rounded-3xl border border-white/10 bg-[#1A1F27]/90 p-8 text-white';

  return (
    <article className={shell}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-apg-muted">
            Refund receipt
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{document.receiptNumber}</h1>
          <p className="mt-2 text-sm text-apg-silver">{formatDateTime(document.refundedAt)}</p>
        </div>
        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
          Refund paid
        </span>
      </header>

      <section className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Resident</p>
          <p className="mt-1 text-lg font-semibold">{document.residentName}</p>
          {document.residentPhone ? (
            <p className="text-sm text-apg-silver">{document.residentPhone}</p>
          ) : null}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Booking</p>
          <p className="mt-1 font-mono text-lg font-semibold">{document.bookingCode}</p>
          <p className="text-sm text-apg-silver">
            {[document.pgName, document.roomNumber ? `Room ${document.roomNumber}` : null, document.bedCode ? `Bed ${document.bedCode}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </section>

      <dl className="mt-8 space-y-3 text-sm">
        <ReceiptRow label="Deposit collected" value={paiseToInr(document.depositCollectedPaise)} />
        {document.deductionLines.length > 0 ? (
          document.deductionLines.map((line) => (
            <ReceiptRow
              key={`${line.label}-${line.amountPaise}`}
              label={line.label}
              value={`−${paiseToInr(line.amountPaise)}`}
            />
          ))
        ) : (
          <ReceiptRow
            label="Deductions"
            value={document.deductionsPaise > 0 ? `−${paiseToInr(document.deductionsPaise)}` : '—'}
          />
        )}
      </dl>

      <div className="my-6 border-t border-white/10" />

      <div className="flex items-end justify-between gap-4">
        <p className="text-sm font-medium text-apg-silver">Refund paid</p>
        <p className="text-3xl font-bold tabular-nums">{paiseToInr(document.refundPaidPaise)}</p>
      </div>

      <dl className="mt-8 space-y-2 text-sm">
        <ReceiptRow
          label="Payment method"
          value={document.refundMethod ? titleCase(document.refundMethod.replace(/_/g, ' ')) : '—'}
        />
        <ReceiptRow label="Reference" value={document.refundReference ?? '—'} mono />
        {document.notes ? <ReceiptRow label="Notes" value={document.notes} /> : null}
        {document.refundedByLabel ? (
          <ReceiptRow label="Processed by" value={document.refundedByLabel} />
        ) : null}
      </dl>
    </article>
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
    <div className="flex items-start justify-between gap-4">
      <dt className="text-apg-silver">{label}</dt>
      <dd className={`max-w-[60%] text-right font-medium ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
