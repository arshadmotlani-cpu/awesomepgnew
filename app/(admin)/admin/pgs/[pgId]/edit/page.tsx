import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArchivePgButton } from '@/src/components/admin/ArchivePgButton';
import { PgAdminForm } from '@/src/components/admin/PgAdminForm';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { isCloudinaryConfigured } from '@/src/lib/images/cloudinary';
import { getPgForAdmin } from '@/src/services/pgAdmin';
import { uploadPgImageAction } from '../../actions';

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

  const cloudinary = isCloudinaryConfigured();

  return (
    <>
      <PageHeader
        title={`Edit — ${pg.name}`}
        description={sp.created === '1' ? 'PG created successfully.' : 'Update listing, images, and features.'}
        actions={
          <div className="flex items-center gap-3">
            <Link href={`/pgs/${pg.slug}`} className="text-sm text-[#FF5A1F] hover:underline" target="_blank">
              View public page
            </Link>
            <ArchivePgButton pgId={pgId} />
          </div>
        }
      />
      <PgAdminForm
        mode="edit"
        pg={pg}
        cloudinaryUploadAction={cloudinary ? uploadPgImageAction : undefined}
      />
    </>
  );
}
