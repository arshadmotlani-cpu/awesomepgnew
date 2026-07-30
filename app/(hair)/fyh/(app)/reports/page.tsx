import { getReportsSnapshot } from '@/src/hair/services/reports';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export default async function ReportsPage() {
  const snap = await getReportsSnapshot();

  const cards = [
    {
      label: "Today's revenue",
      value: formatInrFromPaise(snap.todayRevenuePaise),
      hint: `${snap.todayInvoiceCount} paid invoice${snap.todayInvoiceCount === 1 ? '' : 's'}`,
    },
    {
      label: 'This week',
      value: formatInrFromPaise(snap.weekRevenuePaise),
      hint: `${snap.weekInvoiceCount} paid invoice${snap.weekInvoiceCount === 1 ? '' : 's'}`,
    },
    {
      label: 'This month',
      value: formatInrFromPaise(snap.monthRevenuePaise),
      hint: `${snap.monthInvoiceCount} paid invoice${snap.monthInvoiceCount === 1 ? '' : 's'}`,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="fyh-section-eyebrow">Insights</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Reports</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Paid invoice revenue in salon timezone ({snap.timezone}). Week starts Monday.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="fyh-glass p-4">
            <p className="text-xs uppercase tracking-wide text-fyh-text-muted">{c.label}</p>
            <p className="fyh-display mt-2 text-2xl font-semibold tabular-nums">{c.value}</p>
            <p className="mt-1 text-xs text-fyh-text-secondary">{c.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="fyh-glass p-4">
          <p className="text-xs uppercase tracking-wide text-fyh-text-muted">GST this month</p>
          <p className="fyh-display mt-2 text-xl font-semibold tabular-nums">
            {formatInrFromPaise(snap.monthGstPaise)}
          </p>
          <p className="mt-1 text-xs text-fyh-text-secondary">From paid invoices (tax column)</p>
        </div>
        <div className="fyh-glass p-4">
          <p className="text-xs uppercase tracking-wide text-fyh-text-muted">Top services (month)</p>
          {snap.topServicesThisMonth.length === 0 ? (
            <p className="mt-3 text-sm text-fyh-text-muted">No paid service lines yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {snap.topServicesThisMonth.map((s) => (
                <li key={s.serviceId} className="flex justify-between gap-3">
                  <span>{s.name}</span>
                  <span className="tabular-nums text-fyh-accent">
                    {formatInrFromPaise(s.revenuePaise)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="fyh-glass p-4 lg:col-span-2">
          <p className="text-xs uppercase tracking-wide text-fyh-text-muted">Staff revenue (month)</p>
          {snap.topStaffThisMonth.length === 0 ? (
            <p className="mt-3 text-sm text-fyh-text-muted">No attributed line items yet.</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
              {snap.topStaffThisMonth.map((s) => (
                <li key={s.staffId} className="flex justify-between gap-3 rounded-md bg-black/20 px-3 py-2">
                  <span>{s.name}</span>
                  <span className="tabular-nums text-fyh-accent">
                    {formatInrFromPaise(s.revenuePaise)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
