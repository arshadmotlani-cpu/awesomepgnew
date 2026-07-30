'use client';

import { useActionState } from 'react';
import { saveSalonSettingsAction, type SettingsActionState } from '@/src/hair/actions/settings';
import { SettingsPageHeader, SettingsSaveFeedback } from '@/src/hair/components/settings/SettingsNav';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhBusinessHoursDay } from '@/src/hair/db/schema/settings';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const initial: SettingsActionState = {};

export type SalonSettingsFormValues = {
  businessName: string;
  businessAddress: string;
  defaultBufferMinutes: number;
  timezone: string;
  businessHours: FyhBusinessHoursDay[];
  googleReviewUrl: string;
};

export function SalonSettingsForm({ values }: { values: SalonSettingsFormValues }) {
  const [state, action, pending] = useActionState(saveSalonSettingsAction, initial);
  const hoursByDay = new Map(values.businessHours.map((h) => [h.dayOfWeek, h]));

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        eyebrow="Salon"
        title="Business profile"
        description="Identity, timezone, buffer defaults, and opening hours."
      />

      <form action={action} className="space-y-6">
        <div className="fyh-glass grid gap-3 p-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm text-fyh-text-secondary" htmlFor="businessName">
              Business name
            </label>
            <Input id="businessName" name="businessName" required defaultValue={values.businessName} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm text-fyh-text-secondary" htmlFor="businessAddress">
              Address
            </label>
            <Input id="businessAddress" name="businessAddress" defaultValue={values.businessAddress} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm text-fyh-text-secondary" htmlFor="googleReviewUrl">
              Google Review URL
            </label>
            <Input
              id="googleReviewUrl"
              name="googleReviewUrl"
              type="url"
              placeholder="https://g.page/…"
              defaultValue={values.googleReviewUrl}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary" htmlFor="defaultBufferMinutes">
              Default buffer (minutes)
            </label>
            <Input
              id="defaultBufferMinutes"
              name="defaultBufferMinutes"
              type="number"
              min={0}
              defaultValue={values.defaultBufferMinutes}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary" htmlFor="timezone">
              Salon timezone (IANA)
            </label>
            <Input
              id="timezone"
              name="timezone"
              required
              defaultValue={values.timezone || 'Asia/Kolkata'}
              placeholder="Asia/Kolkata"
            />
          </div>
        </div>

        <div className="fyh-glass space-y-3 p-4">
          <p className="text-sm font-medium text-fyh-text">Business hours</p>
          <div className="space-y-2">
            {DAY_LABELS.map((label, dayOfWeek) => {
              const h = hoursByDay.get(dayOfWeek) ?? {
                dayOfWeek,
                open: '10:00',
                close: '20:00',
                closed: dayOfWeek === 0,
              };
              return (
                <div
                  key={dayOfWeek}
                  className="grid grid-cols-[7rem_1fr_1fr_auto] items-center gap-2"
                >
                  <span className="text-sm text-fyh-text-secondary">{label}</span>
                  <Input name={`open_${dayOfWeek}`} type="time" defaultValue={h.open} />
                  <Input name={`close_${dayOfWeek}`} type="time" defaultValue={h.close} />
                  <label className="flex items-center gap-2 text-sm text-fyh-text-muted">
                    <input
                      type="checkbox"
                      name={`closed_${dayOfWeek}`}
                      defaultChecked={Boolean(h.closed)}
                      className="accent-fyh-forest"
                    />
                    Closed
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <SettingsSaveFeedback state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save salon settings'}
        </Button>
      </form>
    </div>
  );
}

/** @deprecated use SalonSettingsForm */
export const SettingsForm = SalonSettingsForm;
export type SettingsFormValues = SalonSettingsFormValues;
