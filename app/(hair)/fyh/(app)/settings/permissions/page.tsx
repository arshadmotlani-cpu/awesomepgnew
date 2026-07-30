import { PermissionsMatrixPanel } from '@/src/hair/components/settings/PermissionsMatrixPanel';
import { requireSuperAdminPage } from '@/src/hair/lib/auth/guards';

export default async function PermissionsSettingsPage() {
  await requireSuperAdminPage();
  return <PermissionsMatrixPanel />;
}
