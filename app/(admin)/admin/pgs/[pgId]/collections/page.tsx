import { notFound } from 'next/navigation';
import { PgCollectionsPanel } from '@/src/components/admin/PgCollectionsPanel';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { getPgForAdmin } from '@/src/services/pgAdmin';
import { listPendingElectricityProofsForPg } from '@/src/services/meterElectricity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PgCollectionsPage({
  params,
}: {
  params: Promise<{ pgId: string }>;
}) {
  const session = await requireAdminPermission('pgs:write');
  const { pgId } = await params;
  const pg = await getPgForAdmin(pgId, session);
  if (!pg) notFound();

  const pendingProofs = await listPendingElectricityProofsForPg(pgId);

  return (
    <section>
      <PgCollectionsPanel
        pgId={pgId}
        hasPaymentEnabled={pg.hasPaymentEnabled}
        electricityProofs={pendingProofs}
      />
    </section>
  );
}
