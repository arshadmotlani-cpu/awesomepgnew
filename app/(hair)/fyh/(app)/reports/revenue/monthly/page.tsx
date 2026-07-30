import { paidRevenueBetween } from '@/src/hair/services/reports';
import { getSalonSettings } from '@/src/hair/services/settings';
import { salonDayBounds, salonMonthStartUtc } from '@/src/hair/lib/salonTime';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export default async function RevenueMonthlyPage() {
  const settings = await getSalonSettings();
  const tz = settings.timezone?.trim() || 'Asia/Kolkata';
  const { end } = salonDayBounds(tz);
  const monthStart = salonMonthStartUtc(tz);
  const month = await paidRevenueBetween(monthStart, end);

  return (
    <div className="space-y-6">
      <div>
        <p className="fyh-section-eyebrow">Reports</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Revenue · Monthly</h1>
      </div>
      <div className="fyh-glass p-6">
        <p className="fyh-display text-3xl font-semibold tabular-nums">
          {formatInrFromPaise(month.revenuePaise)}
        </p>
        <p className="mt-2 text-sm text-fyh-text-muted">
          GST {formatInrFromPaise(month.taxPaise)} · {month.invoiceCount} invoices
        </p>
      </div>
    </div>
  );
}
