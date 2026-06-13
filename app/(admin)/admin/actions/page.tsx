import { ActionCenter } from '@/src/components/admin/ActionCenter';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { hasDatabaseUrl } from '@/src/lib/db/env';
import { listOpenActionItems, syncActionItems } from '@/src/services/actionItems';
import { SyncActionsButton } from '@/src/components/admin/SyncActionsButton';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ActionCenterPage() {
  await requireAdminSession('/admin/actions');

  if (!hasDatabaseUrl()) {
    return (
      <>
        <PageHeader
          title="Action Center"
          description="Every item is clickable — resolve rent, electricity, KYC, refunds, and more."
        />
        <DbStatusBanner error="DATABASE_URL is not set. Add it to your environment and restart." />
      </>
    );
  }

  const session = await requireAdminSession('/admin/actions');

  try {
    await syncActionItems(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (
      <>
        <PageHeader title="Action Center" description="Operational tasks requiring your attention." />
        <DbStatusBanner error={message} />
      </>
    );
  }

  const items = await listOpenActionItems(session);

  return (
    <>
      <PageHeader
        title="Action Center"
        description="Problem → click → resolve. Rent, electricity, KYC, vacating, refunds, and payment reviews in one queue."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SyncActionsButton />
            <Link
              href="/admin/overview"
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-apg-silver transition hover:border-white/20 hover:text-white"
            >
              Revenue overview
            </Link>
          </div>
        }
      />

      <ActionCenter items={items} />
    </>
  );
}
