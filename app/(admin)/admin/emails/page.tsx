import Link from 'next/link';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { emailDeliverySummary, listEmailDeliveryLog } from '@/src/db/queries/emailDelivery';
import { env } from '@/src/lib/env';
import { formatDate } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const [rows, summary] = await Promise.all([
    listEmailDeliveryLog({ status: sp.status, q: sp.q, limit: 150 }),
    emailDeliverySummary(),
  ]);

  const adminEmail = env.ADMIN_NOTIFICATION_EMAIL;

  return (
    <>
      <PageHeader
        title="Email delivery log"
        description="Every tenant notification is logged here. Failed and skipped sends show the reason."
      />

      <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4 text-sm text-apg-silver">
        <p>
          Admin copy inbox:{' '}
          <strong className="text-white">
            {adminEmail ?? 'Not configured — set ADMIN_NOTIFICATION_EMAIL in env'}
          </strong>
        </p>
        <p className="mt-1 text-xs">
          When configured, all tenant emails (rent, electricity, vacating, etc.) BCC this address.
        </p>
      </div>

      {summary.ok ? (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {(['sent', 'failed', 'skipped'] as const).map((key) => (
            <Link
              key={key}
              href={`/admin/emails?status=${key}`}
              className={`rounded-xl border p-4 ${
                sp.status === key
                  ? 'border-[#FF5A1F]/50 bg-[#FF5A1F]/10'
                  : 'border-white/10 bg-[#1A1F27]'
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-apg-silver">{key}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{summary.data[key]}</p>
              <p className="text-[11px] text-apg-silver">Last 30 days</p>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/emails"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            !sp.status || sp.status === 'all'
              ? 'bg-[#FF5A1F] text-white'
              : 'border border-white/10 text-apg-silver'
          }`}
        >
          All
        </Link>
        {(['sent', 'failed', 'skipped'] as const).map((s) => (
          <Link
            key={s}
            href={`/admin/emails?status=${s}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${
              sp.status === s
                ? 'bg-[#FF5A1F] text-white'
                : 'border border-white/10 text-apg-silver'
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {!rows.ok ? (
        <div className="mt-4">
          <DbStatusBanner error={rows.error} />
        </div>
      ) : rows.data.length === 0 ? (
        <p className="mt-6 text-sm text-apg-silver">No delivery records yet for this filter.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-[#1A1F27]">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-apg-silver">
              <tr className="border-b border-white/10">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-apg-silver">
              {rows.data.map((row) => (
                <tr key={row.id} className="hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        row.status === 'sent'
                          ? 'text-emerald-300'
                          : row.status === 'failed'
                            ? 'text-rose-300'
                            : 'text-amber-300'
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{row.notificationKind}</td>
                  <td className="px-4 py-3 text-xs">
                    {row.recipientEmail}
                    {row.recipientKind === 'admin_copy' ? (
                      <span className="ml-1 text-apg-silver">(copy)</span>
                    ) : null}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-white">
                    {row.subject}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-rose-300/90">
                    {row.skipReason ?? row.errorMessage ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
