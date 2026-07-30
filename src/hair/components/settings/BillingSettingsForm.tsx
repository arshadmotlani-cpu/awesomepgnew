'use client';

import { useActionState } from 'react';
import { saveBillingSettingsAction, type SettingsActionState } from '@/src/hair/actions/settings';
import { SettingsPageHeader, SettingsSaveFeedback } from '@/src/hair/components/settings/SettingsNav';
import { Button } from '@/src/hair/components/ui/button';
import type { FyhBillingSettings } from '@/src/hair/db/schema/settings';

const initial: SettingsActionState = {};

export function BillingSettingsForm({ values }: { values: FyhBillingSettings }) {
  const [state, action, pending] = useActionState(saveBillingSettingsAction, initial);

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        eyebrow="Billing"
        title="Checkout defaults"
        description="Default Quick Sale flags for partial payment, full due, and overpay handling."
      />

      <form action={action} className="space-y-6">
        <div className="fyh-glass space-y-3 p-4">
          <p className="text-sm text-fyh-text-secondary">
            These pre-check options on new Quick Sale sessions. Staff can still change them per sale.
          </p>

          <label className="flex items-center gap-2 text-sm text-fyh-text">
            <input
              type="checkbox"
              name="defaultMarkDue"
              defaultChecked={Boolean(values.defaultMarkDue)}
              className="accent-fyh-forest"
            />
            Default: Mark remaining balance as due (partial payment)
          </label>

          <label className="flex items-center gap-2 text-sm text-fyh-text">
            <input
              type="checkbox"
              name="defaultMarkFullDue"
              defaultChecked={Boolean(values.defaultMarkFullDue)}
              className="accent-fyh-forest"
            />
            Default: Mark full invoice as due (no payment collected)
          </label>

          <label className="flex items-center gap-2 text-sm text-fyh-text">
            <input
              type="checkbox"
              name="defaultCreditOverpayAsAdvance"
              defaultChecked={Boolean(values.defaultCreditOverpayAsAdvance)}
              className="accent-fyh-forest"
            />
            Default: Credit overpayment as customer advance (wallet)
          </label>
        </div>

        <SettingsSaveFeedback state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save billing defaults'}
        </Button>
      </form>
    </div>
  );
}
