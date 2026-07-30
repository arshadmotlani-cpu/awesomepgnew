'use client';

import { useActionState } from 'react';
import { saveGstInvoiceSettingsAction, type SettingsActionState } from '@/src/hair/actions/settings';
import { SettingsPageHeader, SettingsSaveFeedback } from '@/src/hair/components/settings/SettingsNav';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';

const initial: SettingsActionState = {};

export type GstInvoiceSettingsFormValues = {
  gstin: string;
  invoicePrefix: string;
  defaultGstPercent: number;
  invoiceNotes: string;
};

export function GstInvoiceSettingsForm({ values }: { values: GstInvoiceSettingsFormValues }) {
  const [state, action, pending] = useActionState(saveGstInvoiceSettingsAction, initial);

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        eyebrow="GST / Invoice"
        title="Tax & invoicing"
        description="GSTIN, invoice numbering prefix, default tax rate, and footer notes."
      />

      <form action={action} className="space-y-6">
        <div className="fyh-glass grid gap-3 p-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary" htmlFor="gstin">
              GSTIN
            </label>
            <Input id="gstin" name="gstin" defaultValue={values.gstin} placeholder="22AAAAA0000A1Z5" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary" htmlFor="invoicePrefix">
              Invoice prefix
            </label>
            <Input
              id="invoicePrefix"
              name="invoicePrefix"
              required
              defaultValue={values.invoicePrefix}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary" htmlFor="defaultGstPercent">
              Default GST %
            </label>
            <Input
              id="defaultGstPercent"
              name="defaultGstPercent"
              type="number"
              min={0}
              step={0.01}
              defaultValue={values.defaultGstPercent}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm text-fyh-text-secondary" htmlFor="invoiceNotes">
              Invoice notes (footer)
            </label>
            <textarea
              id="invoiceNotes"
              name="invoiceNotes"
              rows={4}
              defaultValue={values.invoiceNotes}
              placeholder="Thank you for visiting. Goods once sold cannot be returned."
              className="min-h-[6rem] w-full rounded-md border border-[color:var(--fyh-border)] bg-black/30 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <SettingsSaveFeedback state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save GST & invoice settings'}
        </Button>
      </form>
    </div>
  );
}
