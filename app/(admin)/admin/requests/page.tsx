import Link from 'next/link';
import { ResidentRequestReviewPanel } from '@/src/components/admin/ResidentRequestReviewPanel';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { titleCase } from '@/src/lib/format';
import { listPendingResidentRequestsForAdmin } from '@/src/services/residentRequests';
import { syncActionItems } from '@/src/services/actionItems';

export const dynamic = 'force-dynamic';

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ reviewed?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireAdminPermission('bookings:write');
  await syncActionItems(session).catch(() => undefined);
  const requests = await listPendingResidentRequestsForAdmin(session);

  return (
    <>
      <PageHeader
        title="Resident requests"
        description="Deposit refund and stay extension queue — synced with Take Action badges."
        actions={
          <Link
            href="/admin/overview"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-apg-silver hover:text-white"
          >
            Overview →
          </Link>
        }
      />

      {sp.reviewed === '1' ? (
        <div className="mb-6 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Request updated — all modules synced.
        </div>
      ) : null}

      {requests.length === 0 ? (
        <p className="text-sm text-apg-silver">No open resident requests.</p>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <div key={r.id}>
              <p className="mb-2 text-xs uppercase tracking-wide text-apg-silver">
                {titleCase(r.type.replace('_', ' '))} · {titleCase(r.status)}
              </p>
              <ResidentRequestReviewPanel request={{ ...r, createdAt: r.createdAt }} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
