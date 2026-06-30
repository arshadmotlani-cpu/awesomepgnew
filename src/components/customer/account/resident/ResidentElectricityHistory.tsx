import Link from 'next/link';
import { paiseToInr, formatDate } from '@/src/lib/format';

export type ResidentElectricityHistoryItem = {
  id: string;
  invoiceNumber: string;
  billingMonth: string;
  amountPaise: number;
  paidPaise: number;
  status: string;
  dueDate: string;
  roomNumber: string;
  isCheckoutSettled?: boolean;
};

export function ResidentElectricityHistory({
  items,
  bookingId,
}: {
  items: ResidentElectricityHistoryItem[];
  bookingId: string;
}) {
  if (items.length === 0) return null;

  const pending = items.filter((i) => i.status === 'pending' && i.amountPaise > 0);
  const paid = items.filter((i) => i.status === 'paid' || i.paidPaise > 0);

  return (
    <section className="space-y-4">
      <header>
        <h3 className="text-base font-semibold text-zinc-900">Electricity</h3>
        <p className="text-sm text-zinc-500">Room electricity bills and payment history</p>
      </header>

      {pending.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Due now</p>
          {pending.map((item) => (
            <ElectricityHistoryRow key={item.id} item={item} bookingId={bookingId} action="pay" />
          ))}
        </div>
      ) : null}

      {paid.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Paid</p>
          {paid.map((item) => (
            <ElectricityHistoryRow key={item.id} item={item} bookingId={bookingId} action="receipt" />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ElectricityHistoryRow({
  item,
  bookingId,
  action,
}: {
  item: ResidentElectricityHistoryItem;
  bookingId: string;
  action: 'pay' | 'receipt';
}) {
  const href =
    action === 'pay'
      ? `/account/resident/pay-electricity/${item.id}`
      : `/account/resident/invoices/${item.id}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <div>
        <p className="font-medium text-zinc-900">
          {item.isCheckoutSettled ? 'Paid at move-out' : `Room ${item.roomNumber}`} ·{' '}
          {item.billingMonth.slice(0, 7)}
        </p>
        <p className="text-xs text-zinc-500">
          {item.invoiceNumber} · due {formatDate(item.dueDate)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold tabular-nums text-zinc-900">
          {paiseToInr(item.paidPaise > 0 ? item.paidPaise : item.amountPaise)}
        </span>
        <Link href={href} className="text-sm font-medium text-orange-600 hover:underline">
          {action === 'pay' ? 'Pay →' : 'Receipt →'}
        </Link>
      </div>
    </div>
  );
}
