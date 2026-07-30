'use client';

import { useActionState } from 'react';
import { saveWhatsappSettingsAction, type SettingsActionState } from '@/src/hair/actions/settings';
import { SettingsPageHeader, SettingsSaveFeedback } from '@/src/hair/components/settings/SettingsNav';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhWhatsappSettings } from '@/src/hair/db/schema/settings';

const initial: SettingsActionState = {};

export function WhatsappSettingsForm({ values }: { values: FyhWhatsappSettings }) {
  const [state, action, pending] = useActionState(saveWhatsappSettingsAction, initial);

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        eyebrow="WhatsApp"
        title="Business WhatsApp"
        description="Enable outbound WhatsApp from Quick Sale and set the salon business number."
      />

      <form action={action} className="space-y-6">
        <div className="fyh-glass space-y-4 p-4">
          <label className="flex items-center gap-2 text-sm text-fyh-text">
            <input
              type="checkbox"
              name="whatsappEnabled"
              defaultChecked={Boolean(values.enabled)}
              className="accent-fyh-forest"
            />
            Enable WhatsApp actions in Quick Sale
          </label>

          <div className="space-y-1">
            <label className="fyh-label" htmlFor="businessPhone">
              Business phone (with country code)
            </label>
            <Input
              id="businessPhone"
              name="businessPhone"
              type="tel"
              placeholder="919876543210"
              defaultValue={values.businessPhone ?? ''}
            />
            <p className="text-xs text-fyh-text-muted">
              Used for wa.me links. Digits only, e.g. 91 followed by 10-digit mobile.
            </p>
          </div>
        </div>

        <SettingsSaveFeedback state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save WhatsApp settings'}
        </Button>
      </form>
    </div>
  );
}
