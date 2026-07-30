'use client';

import { useActionState } from 'react';
import {
  saveCommunicationSettingsAction,
  type SettingsActionState,
} from '@/src/hair/actions/settings';
import { SettingsPageHeader, SettingsSaveFeedback } from '@/src/hair/components/settings/SettingsNav';
import { Button } from '@/src/hair/components/ui/button';
import type { FyhCommunicationSettings } from '@/src/hair/db/schema/settings';

const initial: SettingsActionState = {};

const TEMPLATE_HINT = '{{name}}, {{amount}}, {{link}} — leave blank to use system defaults.';

export function CommunicationSettingsForm({
  values,
}: {
  values: FyhCommunicationSettings | null;
}) {
  const [state, action, pending] = useActionState(saveCommunicationSettingsAction, initial);

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        eyebrow="Communication"
        title="Message templates"
        description="Override WhatsApp invoice and review-request templates."
      />

      <form action={action} className="space-y-6">
        <div className="fyh-glass space-y-4 p-4">
          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary" htmlFor="whatsappInvoiceTemplate">
              WhatsApp invoice template
            </label>
            <textarea
              id="whatsappInvoiceTemplate"
              name="whatsappInvoiceTemplate"
              rows={4}
              defaultValue={values?.whatsappInvoiceTemplate ?? ''}
              placeholder={`Hi {{name}}, your invoice for {{amount}} is ready: {{link}}`}
              className="min-h-[6rem] w-full rounded-md border border-[color:var(--fyh-border)] bg-black/30 px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-fyh-text-muted">{TEMPLATE_HINT}</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary" htmlFor="reviewRequestTemplate">
              Google review request template
            </label>
            <textarea
              id="reviewRequestTemplate"
              name="reviewRequestTemplate"
              rows={4}
              defaultValue={values?.reviewRequestTemplate ?? ''}
              placeholder="Hi {{name}}, we'd love your feedback: {{link}}"
              className="min-h-[6rem] w-full rounded-md border border-[color:var(--fyh-border)] bg-black/30 px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-fyh-text-muted">
              {'{{name}}'}, {'{{link}}'} — review link comes from Salon settings.
            </p>
          </div>
        </div>

        <SettingsSaveFeedback state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save communication templates'}
        </Button>
      </form>
    </div>
  );
}
