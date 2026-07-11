import type { Metadata } from 'next';
import { ChangePasswordForm } from '@/src/capital/components/forms/ChangePasswordForm';
import { SettingsForm } from '@/src/capital/components/forms/SettingsForm';
import { getSettings } from '@/src/capital/services/settings';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-ac-text-secondary">Business configuration and security</p>
      </div>

      <SettingsForm
        defaults={{
          businessName: settings?.businessName ?? 'Automotive Capital',
          profitShareNumerator: settings?.profitShareNumerator ?? 1,
          profitShareDenominator: settings?.profitShareDenominator ?? 2,
          currencyCode: settings?.currencyCode ?? 'INR',
        }}
      />

      <ChangePasswordForm />
    </div>
  );
}
