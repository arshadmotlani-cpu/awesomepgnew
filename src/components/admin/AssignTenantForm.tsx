'use client';

import { useActionState, useId, useMemo, useState } from 'react';
import {
  assignTenantAction,
  type AssignTenantState,
} from '@/app/(admin)/admin/bookings/new/actions';
import { AdminConfirmSubmit } from '@/src/components/admin/AdminConfirmSubmit';
import { paiseToInr } from '@/src/lib/format';

type BedOption = {
  bedId: string;
  label: string;
  monthlyRatePaise: number;
  depositPaise: number;
};

const fieldClass =
  'apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white';
const readOnlyFieldClass = `${fieldClass} opacity-80`;
const lightFieldClass =
  'apg-admin-field mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm';
const lightReadOnlyFieldClass = `${lightFieldClass} bg-zinc-50`;

function inrFromPaise(paise: number): string {
  if (paise <= 0) return '';
  return (paise / 100).toLocaleString('en-IN');
}

export function AssignTenantForm({
  beds,
  defaultBedId,
  defaultStartDate,
  prefill,
  theme = 'light',
}: {
  beds: BedOption[];
  defaultBedId?: string;
  defaultStartDate: string;
  prefill?: {
    customerId: string;
    fullName: string;
    email: string;
    phone: string;
    gender: 'male' | 'female' | 'other';
  } | null;
  theme?: 'light' | 'dark';
}) {
  const formId = useId().replace(/:/g, '');
  const [state, action, pending] = useActionState(assignTenantAction, {
    ok: false,
  } satisfies AssignTenantState);
  const [selectedBedId, setSelectedBedId] = useState(defaultBedId ?? beds[0]?.bedId ?? '');

  const fc = theme === 'dark' ? fieldClass : lightFieldClass;
  const roFc = theme === 'dark' ? readOnlyFieldClass : lightReadOnlyFieldClass;
  const shellClass =
    theme === 'dark'
      ? 'max-w-xl space-y-4 rounded-2xl border border-white/10 bg-[#1A1F27] p-6'
      : 'max-w-xl space-y-4 rounded-xl border border-zinc-200 bg-white p-6';
  const labelClass = theme === 'dark' ? 'font-medium text-apg-silver' : 'font-medium text-zinc-700';

  const selectedBed = useMemo(
    () => beds.find((b) => b.bedId === selectedBedId) ?? null,
    [beds, selectedBedId],
  );

  const defaultBedMissing =
    !!defaultBedId && !beds.some((b) => b.bedId === defaultBedId);

  return (
    <form id={formId} action={action} className={shellClass}>
      {prefill ? <input type="hidden" name="customerId" value={prefill.customerId} /> : null}

      {defaultBedMissing ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          The bed from the link is not free right now (already booked). Pick another bed or clear
          the placeholder booking on the calendar first.
        </p>
      ) : null}

      <label className="block text-sm">
        <span className={labelClass}>Bed *</span>
        <select
          name="bedId"
          required
          value={selectedBedId}
          onChange={(e) => setSelectedBedId(e.target.value)}
          className={fc}
        >
          <option value="" disabled>
            Select bed…
          </option>
          {beds.map((b) => (
            <option key={b.bedId} value={b.bedId}>
              {b.label}
              {b.monthlyRatePaise > 0 ? ` · ₹${inrFromPaise(b.monthlyRatePaise)}/mo` : ''}
            </option>
          ))}
        </select>
        {selectedBed && selectedBed.monthlyRatePaise > 0 ? (
          <span className="mt-1 block text-xs text-zinc-600">
            Website room rate: <strong>₹{inrFromPaise(selectedBed.monthlyRatePaise)}/month</strong>
            {selectedBed.depositPaise > 0 ? (
              <>
                {' '}
                · Website deposit: <strong>₹{inrFromPaise(selectedBed.depositPaise)}</strong>
              </>
            ) : null}
          </span>
        ) : selectedBed ? (
          <span className="mt-1 block text-xs text-amber-700">
            No rent saved for this bed yet. Enter monthly rent below, or save room rent under PG →
            Rooms.
          </span>
        ) : null}
      </label>

      <label className="block text-sm">
        <span className={labelClass}>Move-in date *</span>
        <input
          type="date"
          name="startDate"
          required
          defaultValue={defaultStartDate}
          className={fc}
        />
        <span className={`mt-1 block text-xs ${theme === 'dark' ? 'text-apg-silver' : 'text-zinc-500'}`}>
          Defaults to the 1st of this month. Use the actual move-in day if different.
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className={labelClass}>Full name</span>
          <input
            name="fullName"
            required
            readOnly={!!prefill}
            defaultValue={prefill?.fullName ?? ''}
            className={prefill ? roFc : fc}
          />
        </label>
        <label className="block text-sm">
          <span className={labelClass}>Phone</span>
          <input
            name="phone"
            required
            readOnly={!!prefill}
            placeholder="+91…"
            defaultValue={prefill?.phone ?? ''}
            className={prefill ? roFc : fc}
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className={labelClass}>Email</span>
        <input
          type="email"
          name="email"
          required
          readOnly={!!prefill}
          defaultValue={prefill?.email ?? ''}
          className={prefill ? roFc : fc}
        />
        {prefill ? (
          <span className="mt-1 block text-xs text-zinc-500">
            From website signup — linked to their login.
          </span>
        ) : null}
      </label>

      <label className="block text-sm">
        <span className={labelClass}>Gender *</span>
        <select
          name="gender"
          required
          defaultValue={prefill?.gender ?? 'male'}
          className={fc}
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
      </label>

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950">
        <p className="font-semibold">Rent & deposit for this tenant</p>
        <p className="mt-1 text-xs leading-relaxed text-sky-900">
          Leave monthly rent empty to use the room rate above. If they agreed to a lower deposit
          before prices changed on the website, enter the amount you actually collected — it
          overrides the website deposit.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className={labelClass}>Monthly rent (₹)</span>
          <input
            type="number"
            name="monthlyRentInr"
            min="0"
            step="1"
            placeholder={
              selectedBed && selectedBed.monthlyRatePaise > 0
                ? `Leave empty = ₹${inrFromPaise(selectedBed.monthlyRatePaise)}`
                : 'Required if room has no saved rate'
            }
            className={fc}
          />
        </label>
        <label className="block text-sm">
          <span className={labelClass}>Deposit collected (₹)</span>
          <input
            type="number"
            name="depositInr"
            min="0"
            step="1"
            placeholder={
              selectedBed && selectedBed.depositPaise > 0
                ? `Leave empty = ₹${inrFromPaise(selectedBed.depositPaise)} (website)`
                : 'Amount you received'
            }
            className={fc}
          />
          {selectedBed && selectedBed.depositPaise > 0 ? (
            <span className="mt-1 block text-xs text-zinc-500">
              Website default: <strong>₹{inrFromPaise(selectedBed.depositPaise)}</strong>. Enter a
              lower amount here if that is what you actually collected.
            </span>
          ) : null}
        </label>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
        <input type="checkbox" name="blocksWholeRoom" className="mt-1" />
        <span>
          <strong>Block whole room on calendar</strong> — all beds in the room show occupied to
          others. Only use when one person has the entire room alone (single sharing).
        </span>
      </label>

      <label className="block text-sm">
        <span className={labelClass}>Notes</span>
        <textarea name="notes" rows={2} className={fc} placeholder="Optional internal note…" />
      </label>

      {state.error ? (
        <div
          role="alert"
          className={
            theme === 'dark'
              ? 'rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200'
              : 'rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800'
          }
        >
          <p className="font-semibold">Could not assign tenant</p>
          <p className="mt-1">{state.error}</p>
        </div>
      ) : null}

      <AdminConfirmSubmit
        formId={formId}
        title="Assign tenant to this bed?"
        description={
          <div className="space-y-2">
            <p>
              Assign <strong>{prefill?.fullName ?? 'tenant'}</strong> to{' '}
              <strong>{selectedBed?.label ?? 'selected bed'}</strong>. Creates tenancy and updates
              occupancy immediately. Double-booking is blocked if the bed is taken.
            </p>
            {selectedBed ? (
              <>
                <p>
                  Rent:{' '}
                  <strong>
                    {selectedBed.monthlyRatePaise > 0
                      ? `${paiseToInr(selectedBed.monthlyRatePaise)}/mo (room rate)`
                      : 'Enter manually below'}
                  </strong>
                </p>
                <p>
                  Deposit:{' '}
                  <strong>
                    {selectedBed.depositPaise > 0
                      ? paiseToInr(selectedBed.depositPaise)
                      : 'Enter collected amount'}
                  </strong>
                </p>
              </>
            ) : null}
            <p className="text-xs text-zinc-500">
              After assignment you can send WhatsApp: &ldquo;Your bed has been assigned in [PG
              NAME]&rdquo;
            </p>
          </div>
        }
        confirmLabel="Confirm assignment"
        pending={pending}
        disabled={!selectedBedId}
        className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {pending ? 'Assigning…' : 'Assign tenant to bed'}
      </AdminConfirmSubmit>
    </form>
  );
}
