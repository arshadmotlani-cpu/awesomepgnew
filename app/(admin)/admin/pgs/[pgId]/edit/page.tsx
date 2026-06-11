import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArchivePgButton } from '@/src/components/admin/ArchivePgButton';
import { PgAdminForm } from '@/src/components/admin/PgAdminForm';
import { PgEditSectionNav } from '@/src/components/admin/PgEditSectionNav';
import { MarkPgFullyOccupiedButton } from '@/src/components/admin/MarkPgFullyOccupiedButton';
import { PgRoomOperationsPanel } from '@/src/components/admin/PgRoomOperationsPanel';
import { PgCollectionsPanel } from '@/src/components/admin/PgCollectionsPanel';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { isCloudinaryConfigured } from '@/src/lib/images/cloudinary';
import { getPgInventory } from '@/src/services/pgInventory';
import { getPgForAdmin } from '@/src/services/pgAdmin';
import {
  getPgMeterSummaries,
  listPendingElectricityProofsForPg,
} from '@/src/services/meterElectricity';
import { uploadPgImageAction, uploadPgVideoAction } from '../../actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function EditPgPage({
  params,
  searchParams,
}: {
  params: Promise<{ pgId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const session = await requireAdminPermission('pgs:write');
  const { pgId } = await params;
  const sp = await searchParams;
  const pg = await getPgForAdmin(pgId, session);
  if (!pg) notFound();

  const inventory = await getPgInventory(session, pgId);
  const cloudinary = isCloudinaryConfigured();
  const meterSummaries = await getPgMeterSummaries(session, pgId);
  const pendingProofs = await listPendingElectricityProofsForPg(pgId);

  return (
    <>
      <div className="mb-4">
        <Link
          href="/admin/pgs"
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-[#FF5A1F]"
        >
          ← Back to PGs
        </Link>
      </div>

      <PageHeader
        title={`Edit — ${pg.name}`}
        description={
          sp.created === '1'
            ? 'Follow the 3 steps below: listing → rooms & electricity → collections.'
            : 'Listing on /pgs, per-room rent & meter billing, and QR collections.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/pgs/${pg.slug}`}
              className="text-sm text-[#FF5A1F] hover:underline"
              target="_blank"
            >
              View public page
            </Link>
            <ArchivePgButton pgId={pgId} />
          </div>
        }
      />

      <PgEditSectionNav bedCount={inventory.beds.length} />

      <div id="pg-section-listing" className="scroll-mt-24">
        <PgAdminForm
          mode="edit"
          pg={pg}
          cloudinaryConfigured={cloudinary}
          cloudinaryUploadAction={cloudinary ? uploadPgImageAction : undefined}
          cloudinaryVideoUploadAction={cloudinary ? uploadPgVideoAction : undefined}
        />
      </div>

      <div className="mt-8 scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            Occupancy tools — use when every bed is filled but not yet booked online.
          </p>
          <MarkPgFullyOccupiedButton pgId={pgId} pgName={pg.name} />
        </div>
        <PgRoomOperationsPanel
          pgId={pgId}
          floors={inventory.floors}
          beds={inventory.beds}
          roomMeters={meterSummaries}
          cloudinaryConfigured={cloudinary}
        />
      </div>

      <div className="mt-8 scroll-mt-24">
        <PgCollectionsPanel
          pgId={pgId}
          hasPaymentEnabled={pg.hasPaymentEnabled}
          electricityProofs={pendingProofs}
        />
      </div>
    </>
  );
}
