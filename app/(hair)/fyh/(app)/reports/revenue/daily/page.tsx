import { paidRevenueBetween } from '@/src/hair/services/reports';
import { getSalonSettings } from '@/src/hair/services/settings';
import { salonDayBounds } from '@/src/hair/lib/salonTime';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export default async function RevenueDailyPage() {
  const settings = await getSalonSettings();
  const tz = settings.timezone?.trim() || 'Asia/Kolkata';
  const { start, end } = salonDayBounds(tz);
  const day = await paidRevenueBetween(start, end);

  return (
    <ReportFrame title="Revenue · Daily" timezone={tz}>
      <p className="fyh-display text-3xl font-semibold tabular-nums">
        {formatInrFromPaise(day.revenuePaise)}
      </p>
      <p className="mt-2 text-sm text-fyh-text-muted">
        {day.invoiceCount} paid invoice{day.invoiceCount === 1 ? '' : 's'} today
      </p>
    </ReportFrame>
  );
}

function ReportFrame({
  title,
  timezone,
  children,
}: {
  title: string;
  timezone: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="fyh-section-eyebrow">Reports</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">Salon timezone: {timezone}</p>
      </div>
      <div className="fyh-glass p-6">{children}</div>
    </div>
  );
}
