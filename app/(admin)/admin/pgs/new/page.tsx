import Link from 'next/link';
import { PgAdminForm } from '@/src/components/admin/PgAdminForm';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { isCloudinaryConfigured } from '@/src/lib/images/cloudinary';
import { uploadPgImageAction, uploadPgVideoAction } from '../actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function NewPgPage() {
  await requireAdminPermission('pgs:write');
  const cloudinary = isCloudinaryConfigured();

  return (
    <>
      <PageHeader
        title="Add new PG"
        description="Create a listing — changes appear on /pgs instantly after save."
        actions={
          <Link href="/admin/pgs" className="text-sm text-zinc-400 hover:text-white">
            ← Back to PGs
          </Link>
        }
      />
      <PgAdminForm
        mode="create"
        cloudinaryConfigured={cloudinary}
        cloudinaryUploadAction={cloudinary ? uploadPgImageAction : undefined}
        cloudinaryVideoUploadAction={cloudinary ? uploadPgVideoAction : undefined}
      />
    </>
  );
}
