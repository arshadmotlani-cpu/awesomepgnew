import Link from 'next/link';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { listOwnerPayments } from '@/src/services/qrPayments';
import { paiseToInr } from '@/src/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminPaymentsPage() {
  const session = await requireAdminPermission('payments:write');
  const payments = await listOwnerPayments(session);

  return (
    <>
      <PageHeader
        title="Collections (all PGs)"
        description="Rent and electricity QR submissions from /pgs. To set up QR categories per PG, use PG listings → Edit → Section 3 Collections."
      />
      <div className="space-y-2">
        {payments.length === 0 ? (
          <p className="text-sm text-zinc-400">No payment submissions yet.</p>
        ) : (
          payments.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
            >
              <div>
                <p className="font-medium text-white">
                  {p.customerName} · {p.categoryName}
                </p>
                <p className="text-sm text-zinc-400">
                  <Link href={`/admin/pgs/${p.pgId}/collections`} className="text-[#FF5A1F] hover:underline">
                    {p.pgName}
                  </Link>
                  {' · '}
                  {paiseToInr(p.amountPaise)}
                  {p.month ? ` · ${p.month}` : ''}
                </p>
                <a
                  href={p.paymentScreenshotUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-zinc-500 underline"
                >
                  Screenshot
                </a>
              </div>
              <span className="text-xs uppercase tracking-wide text-zinc-400">{p.status}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
