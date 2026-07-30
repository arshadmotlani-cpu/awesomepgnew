'use client';

import { useActionState } from 'react';
import { savePrinterSettingsAction, type SettingsActionState } from '@/src/hair/actions/settings';
import { SettingsPageHeader, SettingsSaveFeedback } from '@/src/hair/components/settings/SettingsNav';
import { Button } from '@/src/hair/components/ui/button';
import type { FyhPrinterSettings } from '@/src/hair/db/schema/settings';

const initial: SettingsActionState = {};

export function PrinterSettingsForm({ values }: { values: FyhPrinterSettings }) {
  const [state, action, pending] = useActionState(savePrinterSettingsAction, initial);
  const width = values.receiptWidthMm ?? 80;

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        eyebrow="Printer"
        title="Receipt printing"
        description="Thermal receipt width and auto-print after checkout."
      />

      <form action={action} className="space-y-6">
        <div className="fyh-glass space-y-4 p-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fyh-text">Receipt width</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="receiptWidthMm"
                value="58"
                defaultChecked={width === 58}
                className="accent-fyh-forest"
              />
              58 mm (compact)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="receiptWidthMm"
                value="80"
                defaultChecked={width !== 58}
                className="accent-fyh-forest"
              />
              80 mm (standard)
            </label>
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-fyh-text">
            <input
              type="checkbox"
              name="autoPrint"
              defaultChecked={Boolean(values.autoPrint)}
              className="accent-fyh-forest"
            />
            Auto-print receipt after successful checkout
          </label>
        </div>

        <SettingsSaveFeedback state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save printer settings'}
        </Button>
      </form>
    </div>
  );
}
