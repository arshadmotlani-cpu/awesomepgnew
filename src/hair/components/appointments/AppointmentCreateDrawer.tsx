'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  createAppointmentAction,
  type ApptActionState,
} from '@/src/hair/actions/appointments';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type {
  CreateSlotPrefill,
  CustomerOpt,
  ResourceOpt,
  ServiceOpt,
  StaffOpt,
} from './calendarTypes';
import { minutesToSlotLabel } from './schedulerConstants';
import { utcFromDayAndMinutes } from './schedulerTime';

type Props = {
  open: boolean;
  onClose: () => void;
  prefill: CreateSlotPrefill | null;
  staff: StaffOpt[];
  resources: ResourceOpt[];
  customers: CustomerOpt[];
  services: ServiceOpt[];
  timezone: string;
  preselectCustomerId?: string | null;
  onSuccess: () => void;
};

const createInitial: ApptActionState = {};

export function AppointmentCreateDrawer({
  open,
  onClose,
  prefill,
  staff,
  resources,
  customers,
  services,
  timezone,
  preselectCustomerId,
  onSuccess,
}: Props) {
  const [createState, createAction, createPending] = useActionState(
    createAppointmentAction,
    createInitial,
  );
  const [primaryServiceId, setPrimaryServiceId] = useState('');
  const [extraServiceIds, setExtraServiceIds] = useState<string[]>([]);

  useEffect(() => {
    if (createState.success) {
      onSuccess();
      onClose();
    }
  }, [createState.success, onClose, onSuccess]);

  const startMinutes = prefill?.startMinutes ?? 10 * 60;
  const dayIso = prefill?.dayIso ?? '';
  const staffId = prefill?.staffId ?? staff[0]?.id ?? '';

  const selectedServiceIds = useMemo(() => {
    const ids = primaryServiceId ? [primaryServiceId] : [];
    for (const id of extraServiceIds) {
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }, [primaryServiceId, extraServiceIds]);

  const durationMinutes = useMemo(() => {
    return selectedServiceIds.reduce((sum, id) => {
      const s = services.find((x) => x.id === id);
      return sum + (s?.durationMinutes ?? 0);
    }, 0);
  }, [selectedServiceIds, services]);

  const startAtIso = prefill
    ? utcFromDayAndMinutes(dayIso, startMinutes, timezone).toISOString()
    : '';
  const endAtPreview =
    prefill && durationMinutes > 0
      ? utcFromDayAndMinutes(dayIso, startMinutes + durationMinutes, timezone)
      : null;

  if (!open) return null;

  const staffName = staff.find((s) => s.id === staffId)?.fullName ?? '—';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 p-0 sm:p-4">
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-[color:var(--fyh-border)] bg-fyh-elevated p-5 shadow-2xl sm:rounded-2xl sm:border">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="fyh-display text-xl font-semibold">New appointment</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {prefill ? (
          <div className="mb-4 space-y-1 rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 py-2 text-sm">
            <p><span className="text-fyh-text-secondary">Date</span> {dayIso}</p>
            <p><span className="text-fyh-text-secondary">Stylist</span> {staffName}</p>
            <p>
              <span className="text-fyh-text-secondary">Start</span>{' '}
              {minutesToSlotLabel(startMinutes)}
              {endAtPreview ? (
                <span className="text-fyh-text-muted">
                  {' '}
                  → {minutesToSlotLabel(startMinutes + durationMinutes)}
                </span>
              ) : null}
            </p>
          </div>
        ) : null}

        <form action={createAction} className="space-y-3">
          {prefill ? <input type="hidden" name="startAt" value={startAtIso} /> : null}

          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary">Customer</label>
            <select
              name="customerId"
              required
              className="flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text"
              defaultValue={preselectCustomerId ?? ''}
            >
              <option value="" disabled>Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} · {c.phone}
                </option>
              ))}
            </select>
          </div>

          {!prefill ? (
            <>
              <div className="space-y-1">
                <label className="text-sm text-fyh-text-secondary">Stylist</label>
                <select
                  name="staffId"
                  required
                  className="flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text"
                  defaultValue={staffId}
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.fullName}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-fyh-text-secondary">Start</label>
                <Input name="startAt" type="datetime-local" required />
              </div>
            </>
          ) : (
            <input type="hidden" name="staffId" value={staffId} />
          )}

          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary">Chair / resource</label>
            <select
              name="resourceId"
              className="flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text"
              defaultValue=""
            >
              <option value="">None</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary">Primary service</label>
            <select
              required
              value={primaryServiceId}
              onChange={(e) => setPrimaryServiceId(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text"
            >
              <option value="" disabled>Select service</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMinutes}m · {formatInrFromPaise(s.pricePaise)}
                </option>
              ))}
            </select>
            {primaryServiceId ? (
              <input type="hidden" name="serviceIds" value={primaryServiceId} />
            ) : null}
          </div>

          {extraServiceIds.map((id, idx) => (
            <div key={idx} className="space-y-1">
              <label className="text-sm text-fyh-text-secondary">Additional service</label>
              <select
                value={id}
                onChange={(e) => {
                  const next = [...extraServiceIds];
                  next[idx] = e.target.value;
                  setExtraServiceIds(next);
                }}
                className="flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text"
              >
                <option value="">—</option>
                {services
                  .filter((s) => s.id !== primaryServiceId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.durationMinutes}m
                    </option>
                  ))}
              </select>
              {id ? <input type="hidden" name="serviceIds" value={id} /> : null}
            </div>
          ))}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExtraServiceIds((prev) => [...prev, ''])}
          >
            Add another service
          </Button>

          <div className="flex items-center gap-2">
            <input id="walkInCreate" type="checkbox" name="source" value="walk_in" className="accent-fyh-forest" />
            <label htmlFor="walkInCreate" className="text-sm text-fyh-text-secondary">Walk-in</label>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary">Repeat weeks</label>
            <Input name="recurrenceWeeks" type="number" min={1} max={12} defaultValue={1} />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary">Notes</label>
            <Input name="notes" placeholder="Optional" />
          </div>

          {createState.error ? (
            <p className="text-sm text-fyh-danger">{createState.error}</p>
          ) : null}

          <Button type="submit" disabled={createPending || !primaryServiceId} className="w-full">
            {createPending ? 'Saving…' : 'Create'}
          </Button>
        </form>
      </div>
    </div>
  );
}
