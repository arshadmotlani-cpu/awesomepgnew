import Link from 'next/link';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { isCollectionsV1Enabled } from '@/src/lib/collections/featureFlag';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Phase 3 reminders stub — policies/templates seeded; cron writes delivery logs. */
export default async function CollectionsRemindersStubPage() {
  if (!isCollectionsV1Enabled()) redirect('/admin/billing');
  const session = await requireAdminSession('/admin/collections/reminders');
  if (!adminHasPermission(session.role, 'collections:read')) {
    redirect('/admin/overview');
  }
  const canRemind = adminHasPermission(session.role, 'collections:remind');

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Admin', href: '/admin/overview' },
          { label: 'Collections', href: '/admin/collections' },
          { label: 'Reminders' },
        ]}
      />
      <PageHeader
        title="Collection reminders"
        description="WhatsApp Phase 1 uses wa.me links + delivery logs (not Meta API). Cron: /api/cron/collections-reminders."
        actions={
          <Link
            href="/admin/collections"
            className="inline-flex min-h-[36px] items-center rounded-lg border border-white/15 px-3 text-xs font-medium text-white hover:bg-white/5"
          >
            Back to Collections
          </Link>
        }
      />
      <div className="mt-8 space-y-4 rounded-xl border border-dashed border-white/20 bg-[#1A1F27] p-8 text-sm text-apg-silver">
        <p>
          Seeded offsets: billing −7 / −3 / −1 / 0 and due 0 / +1 / +3 / +7. Policy editor and
          delivery history UI land after the reminder engine is proven in cron.
        </p>
        {!canRemind ? (
          <p className="text-amber-200/90">Your role cannot send reminders (needs collections:remind).</p>
        ) : null}
      </div>
    </>
  );
}
