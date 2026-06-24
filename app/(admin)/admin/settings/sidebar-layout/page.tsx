import Link from 'next/link';
import { SidebarLayoutEditor } from '@/src/components/admin/sidebar/SidebarLayoutEditor';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { getEditableSidebarLayout, getResolvedSidebarLayout } from '@/src/services/sidebarLayouts';

export const dynamic = 'force-dynamic';

export default async function SidebarLayoutSettingsPage() {
  const session = await requireAdminSession('/admin/settings/sidebar-layout');
  const [resolved, editable] = await Promise.all([
    getResolvedSidebarLayout(session),
    getEditableSidebarLayout(session, 'personal'),
  ]);

  return (
    <>
      <PageHeader
        title="Sidebar layout"
        description="Drag to reorder admin navigation. Save a personal layout for yourself or a global layout for all admins (Super Admin only)."
        actions={
          <Link
            href="/admin/settings"
            className="text-sm font-medium text-apg-silver hover:text-apg-orange"
          >
            ← Back to settings
          </Link>
        }
      />

      <SidebarLayoutEditor
        initialItems={editable.items}
        isSuperAdmin={session.role === 'super_admin'}
        activeSource={resolved.source}
      />
    </>
  );
}
