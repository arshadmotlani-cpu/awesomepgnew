import { AdminPendingPaymentsPanel } from '@/src/components/admin/AdminPendingPaymentsPanel';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminPaymentsPage() {
  const session = await requireAdminPermission('payments:write');
  const pending = await listPendingPaymentReviews(session);

  return (
    <>
      <PageHeader
        title="Collections (all PGs)"
        description="Review payment photos from tenants — rent, electricity, extensions, and QR submissions. Approve only after verifying the screenshot matches the amount."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">
          Awaiting approval ({pending.length})
        </h2>
        <AdminPendingPaymentsPanel items={pending} />
      </section>
    </>
  );
}
