'use client';

import { useActionState, useId, useMemo, useState } from 'react';
import {
  updateTenancyAction,
  type UpdateTenancyState,
} from '@/app/(admin)/admin/residents/[customerId]/actions';
import { AdminConfirmSubmit } from '@/src/components/admin/AdminConfirmSubmit';
import { BedAssignmentWhatsAppButton } from '@/src/components/admin/BedAssignmentWhatsAppButton';

type BedOption = { bedId: string; label: string };

function parseBedLabel(label: string): { pgName: string; roomNumber?: string; bedCode?: string } {
  const parts = label.split('·').map((p) => p.trim());
  const pgName = parts[0] ?? label;
  const roomPart = parts.find((p) => p.toLowerCase().startsWith('room '));
  const roomNumber = roomPart?.replace(/^room\s+/i, '');
  const bedCode = parts[parts.length - 1]?.replace(/\s*\(current\)$/i, '');
  return { pgName, roomNumber, bedCode };
}

export function EditTenantTenancyForm({
  bookingId,
  customerId,
  customerName,
  customerPhone,
  currentBedId,
  currentRoomLabel,
  blocksWholeRoom,
  beds,
}: {
  bookingId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  currentBedId: string;
  currentRoomLabel: string;
  blocksWholeRoom: boolean;
  beds: BedOption[];
}) {
  const formId = useId().replace(/:/g, '');
  const [state, action, pending] = useActionState(updateTenancyAction, {
    ok: false,
  } satisfies UpdateTenancyState);
  const [selectedBedId, setSelectedBedId] = useState(currentBedId);

  const selectedBed = useMemo(
    () => beds.find((b) => b.bedId === selectedBedId) ?? null,
    [beds, selectedBedId],
  );

  const bedChanged = selectedBedId !== currentBedId;
  const parsedTarget = selectedBed ? parseBedLabel(selectedBed.label) : null;

  return (
    <form
      id={formId}
      action={action}
      className="space-y-4 rounded-2xl border border-white/10 bg-[#1A1F27] p-5"
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="currentBedId" value={currentBedId} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="customerName" value={customerName} />
      <input type="hidden" name="customerPhone" value={customerPhone} />

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
          Reassign bed
        </h3>
        <p className="mt-1 text-sm text-apg-silver">
          Current: <strong className="text-white">{currentRoomLabel}</strong>
        </p>
        <p className="mt-2 text-xs text-apg-silver">
          Occupancy mapping only. Change rent or record deposits from Billing / Deposits modules.
        </p>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-apg-silver">PG · Room · Bed</span>
        <select
          name="newBedId"
          value={selectedBedId}
          onChange={(e) => setSelectedBedId(e.target.value)}
          className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
        >
          {beds.map((b) => (
            <option key={b.bedId} value={b.bedId}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-start gap-2 text-sm text-apg-silver">
        <input type="checkbox" name="blocksWholeRoom" defaultChecked={blocksWholeRoom} />
        <span>Block whole room on calendar (single-tenant room)</span>
      </label>

      {state.error ? <p className="text-sm text-rose-300">{state.error}</p> : null}

      {state.ok && parsedTarget && bedChanged ? (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
          <p className="font-semibold">Bed reassigned</p>
          <div className="mt-2">
            <BedAssignmentWhatsAppButton
              customerName={customerName}
              phone={customerPhone}
              pgName={parsedTarget.pgName}
              roomNumber={parsedTarget.roomNumber}
              bedCode={parsedTarget.bedCode}
            />
          </div>
        </div>
      ) : null}

      <AdminConfirmSubmit
        formId={formId}
        title={bedChanged ? 'Reassign to this bed?' : 'No change'}
        description={
          bedChanged && selectedBed ? (
            <p>
              Move <strong>{customerName}</strong> to <strong>{selectedBed.label}</strong>. Occupancy
              updates immediately; no financial entries are created.
            </p>
          ) : (
            <p>Select a different bed to reassign this tenant.</p>
          )
        }
        confirmLabel={bedChanged ? 'Confirm reassignment' : 'Save'}
        tone={bedChanged ? 'danger' : 'default'}
        pending={pending}
        disabled={!bedChanged}
        className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {pending ? 'Saving…' : bedChanged ? 'Reassign bed' : 'Select another bed to reassign'}
      </AdminConfirmSubmit>
    </form>
  );
}
