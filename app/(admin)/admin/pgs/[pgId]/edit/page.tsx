import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArchivePgButton } from '@/src/components/admin/ArchivePgButton';
import { PgAdminForm } from '@/src/components/admin/PgAdminForm';
import { PgInventoryPanel } from '@/src/components/admin/PgInventoryPanel';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { isCloudinaryConfigured } from '@/src/lib/images/cloudinary';
import { getPgInventory } from '@/src/services/pgInventory';
import { getPgForAdmin } from '@/src/services/pgAdmin';
import { PgPaymentsAdminPanel } from '@/src/components/admin/PgPaymentsAdminPanel';
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
            ? 'PG created. Add photos, facilities, beds, and pricing below.'
            : 'Update listing details, media, facilities, beds, and payments.'
        }
        actions={
          <div className="flex items-center gap-3">
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

      <PgAdminForm
        mode="edit"
        pg={pg}
        cloudinaryConfigured={cloudinary}
        cloudinaryUploadAction={cloudinary ? uploadPgImageAction : undefined}
        cloudinaryVideoUploadAction={cloudinary ? uploadPgVideoAction : undefined}
      />

      <div className="mt-8">
        <PgInventoryPanel pgId={pgId} floors={inventory.floors} beds={inventory.beds} />
      </div>

      <PgPaymentsAdminPanel pgId={pgId} hasPaymentEnabled={pg.hasPaymentEnabled} />
    </>
  );
}
