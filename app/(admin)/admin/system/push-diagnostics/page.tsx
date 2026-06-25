import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { PushDiagnosticsPanel } from '@/src/components/admin/PushDiagnosticsPanel';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { requireAdminSession } from '@/src/lib/auth/guards';

export const dynamic = 'force-dynamic';

export default async function PushDiagnosticsPage() {
  await requireAdminSession('/admin/system/push-diagnostics');

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.system.label, href: moduleHref('system') },
          { label: 'Push diagnostics' },
        ]}
      />
      <PageHeader
        title="Push diagnostics"
        description="Verify PWA service worker, notification permission, push subscription, and VAPID configuration."
      />
      <AdminSectionErrorBoundary title="Push diagnostics">
        <PushDiagnosticsPanel />
      </AdminSectionErrorBoundary>
    </>
  );
}
