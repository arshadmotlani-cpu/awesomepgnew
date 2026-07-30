import { HistoricalImportPanel } from '@/src/hair/components/settings/HistoricalImportPanel';
import { requireSuperAdminPage } from '@/src/hair/lib/auth/guards';

export default async function HistoricalImportSettingsPage() {
  await requireSuperAdminPage();
  return <HistoricalImportPanel />;
}
