import { notFound } from 'next/navigation';
import { PgAdminForm } from '@/src/components/admin/PgAdminForm';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { isCloudinaryConfigured } from '@/src/lib/images/cloudinary';
import { getPgForAdmin } from '@/src/services/pgAdmin';
import { uploadPgImageAction, uploadPgVideoAction } from '../../actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PgListingPage({
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
    <section>
      {sp.created === '1' ? (
        <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          PG created. Next: open{' '}
          <strong>2. Rooms & electricity</strong> to add beds and meter readings, then{' '}
          <strong>3. Collections</strong> for QR payments.
        </p>
      ) : null}
      <PgAdminForm
        mode="edit"
        pg={pg}
        cloudinaryConfigured={cloudinary}
        cloudinaryUploadAction={cloudinary ? uploadPgImageAction : undefined}
        cloudinaryVideoUploadAction={cloudinary ? uploadPgVideoAction : undefined}
      />
    </section>
  );
}
