import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArchivePgButton } from '@/src/components/admin/ArchivePgButton';
import { PgEditSectionNav } from '@/src/components/admin/PgEditSectionNav';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { getPgInventory } from '@/src/services/pgInventory';
import { getPgForAdmin } from '@/src/services/pgAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PgSetupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ pgId: string }>;
}) {
  const session = await requireAdminPermission('pgs:write');
  const { pgId } = await params;
  const pg = await getPgForAdmin(pgId, session);
  if (!pg) notFound();

  const inventory = await getPgInventory(session, pgId);

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
        title={pg.name}
        description="One page per section — bed map, listing, rooms & electricity, or collections."
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

      <PgEditSectionNav pgId={pgId} bedCount={inventory.beds.length} />

      {children}
    </>
  );
}
