import { AppearanceSettingsPanel } from '@/src/hair/components/settings/AppearanceSettingsPanel';
import { SettingsPageHeader } from '@/src/hair/components/settings/SettingsNav';

export default function AppearanceSettingsPage() {
  return (
    <div className="space-y-6">
      <SettingsPageHeader
        eyebrow="Settings"
        title="Appearance"
        description="Choose theme mode and accent colour for the entire FYHAIR application."
      />
      <AppearanceSettingsPanel />
    </div>
  );
}
