'use client';

import { useActionState } from 'react';
import { saveSalonSettingsAction, type SettingsActionState } from '@/src/hair/actions/settings';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhBusinessHoursDay } from '@/src/hair/db/schema/settings';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const initial: SettingsActionState = {};

export type SettingsFormValues = {
  businessName: string;
  businessAddress: string;
  gstin: string;
  invoicePrefix: string;
  defaultGstPercent: number;
  defaultBufferMinutes: number;
  timezone: string;
  businessHours: FyhBusinessHoursDay[];
};

export function SettingsForm({ values }: { values: SettingsFormValues }) {
  const [state, action, pending] = useActionState(saveSalonSettingsAction, initial);
  const hoursByDay = new Map(values.businessHours.map((h) => [h.dayOfWeek, h]));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">Salon</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Business identity, tax defaults, and opening hours.
        </p>
      </div>

      <form action={action} className="space-y-6">
        <div className="fyh-glass grid gap-3 p-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm text-fyh-text-secondary" htmlFor="businessName">
              Business name
            </label>
            <Input
              id="businessName"
              name="businessName"
              required
              defaultValue={values.businessName}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm text-fyh-text-secondary" htmlFor="businessAddress">
              Address
            </label>
            <Input
              id="businessAddress"
              name="businessAddress"
              defaultValue={values.businessAddress}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary" htmlFor="gstin">
              GSTIN
            </label>
            <Input id="gstin" name="gstin" defaultValue={values.gstin} />
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
          <div className="space-y-1 sm:col-span-2">
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
                  <Input
                    name={`open_${dayOfWeek}`}
                    type="time"
                    defaultValue={h.open}
                  />
                  <Input
                    name={`close_${dayOfWeek}`}
                    type="time"
                    defaultValue={h.close}
                  />
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

        {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-fyh-success">{state.success}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save settings'}
        </Button>
      </form>
    </div>
  );
}
