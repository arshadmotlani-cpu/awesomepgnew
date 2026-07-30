'use client';

import { useActionState } from 'react';
import { saveInventorySettingsAction, type SettingsActionState } from '@/src/hair/actions/settings';
import { SettingsPageHeader, SettingsSaveFeedback } from '@/src/hair/components/settings/SettingsNav';
import { Button } from '@/src/hair/components/ui/button';
import type { FyhInventorySettings } from '@/src/hair/db/schema/settings';

const initial: SettingsActionState = {};

export function InventorySettingsForm({ values }: { values: FyhInventorySettings }) {
  const [state, action, pending] = useActionState(saveInventorySettingsAction, initial);

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        eyebrow="Inventory"
        title="Stock policy"
        description="Control whether product sales can drive stock below zero."
      />

      <form action={action} className="space-y-6">
        <div className="fyh-glass space-y-3 p-4">
          <label className="flex items-center gap-2 text-sm text-fyh-text">
            <input
              type="checkbox"
              name="allowNegativeStock"
              defaultChecked={Boolean(values.allowNegativeStock)}
              className="accent-fyh-forest"
            />
            Allow negative stock on product sales
          </label>
          <p className="text-xs text-fyh-text-muted">
            When disabled, checkout clamps product deductions at zero on hand (current behaviour).
            When enabled, sales may reduce stock below zero for back-order tracking.
          </p>
        </div>

        <SettingsSaveFeedback state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save inventory settings'}
        </Button>
      </form>
    </div>
  );
}
