'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useMemo, useState } from 'react';
import {
  updateTenancyAction,
  type UpdateTenancyState,
} from '@/app/(admin)/admin/residents/[customerId]/actions';
import { AdminConfirmSubmit } from '@/src/components/admin/AdminConfirmSubmit';
import { BedAssignmentWhatsAppButton } from '@/src/components/admin/BedAssignmentWhatsAppButton';
import { RentUpdatedWhatsAppButton } from '@/src/components/admin/RentUpdatedWhatsAppButton';
import { paiseToInr } from '@/src/lib/format';

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
  currentMonthlyRentPaise,
  currentDepositPaise,
  ledgerCollectedPaise,
  websiteDepositPaise,
  blocksWholeRoom,
  beds,
}: {
  bookingId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  currentBedId: string;
  currentRoomLabel: string;
  currentMonthlyRentPaise: number;
  currentDepositPaise: number;
  ledgerCollectedPaise: number;
  websiteDepositPaise: number;
  blocksWholeRoom: boolean;
  beds: BedOption[];
}) {
  const router = useRouter();
  const formId = useId().replace(/:/g, '');
  const [state, action, pending] = useActionState(updateTenancyAction, {
    ok: false,
  } satisfies UpdateTenancyState);
  const [selectedBedId, setSelectedBedId] = useState(currentBedId);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const selectedBed = useMemo(
    () => beds.find((b) => b.bedId === selectedBedId) ?? null,
    [beds, selectedBedId],
  );

  const bedChanged = selectedBedId !== currentBedId;
  const parsedTarget = selectedBed ? parseBedLabel(selectedBed.label) : null;

  const depositMismatch =
    ledgerCollectedPaise > 0 && ledgerCollectedPaise !== currentDepositPaise;

  return (
    <form
      id={formId}
      action={action}
      className="space-y-4 rounded-2xl border border-white/10 bg-[#1A1F27] p-5"
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="customerName" value={customerName} />
      <input type="hidden" name="customerPhone" value={customerPhone} />

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
          Assign / reassign bed
        </h3>
        <p className="mt-1 text-sm text-apg-silver">
          Current: <strong className="text-white">{currentRoomLabel}</strong> · Rent{' '}
          {paiseToInr(currentMonthlyRentPaise)}/mo · Deposit {paiseToInr(currentDepositPaise)}
          {ledgerCollectedPaise > 0 ? ` · Ledger ${paiseToInr(ledgerCollectedPaise)}` : null}
        </p>
      </div>

      {depositMismatch ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Booking deposit and ledger collected amount differ. Save below to reconcile both to the
          amount you enter.
        </p>
      ) : null}

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

      <label className="block text-sm">
        <span className="font-medium text-apg-silver">Monthly rent (₹)</span>
        <input
          type="number"
          name="monthlyRentInr"
          min="0"
          step="1"
          defaultValue={Math.round(currentMonthlyRentPaise / 100)}
          className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
        />
        {bedChanged ? (
          <span className="mt-1 block text-xs text-sky-300">
            Rent may change with the new bed — confirm the amount before saving.
          </span>
        ) : null}
      </label>

      <label className="block text-sm">
        <span className="font-medium text-apg-silver">Deposit collected (₹)</span>
        <input
          type="number"
          name="depositCollectedInr"
          min="0"
          step="1"
          defaultValue={Math.round(currentDepositPaise / 100)}
          className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
        />
        {websiteDepositPaise > 0 ? (
          <span className="mt-1 block text-xs text-apg-silver">
            Website default for this bed: <strong>{paiseToInr(websiteDepositPaise)}</strong>
          </span>
        ) : null}
      </label>

      <label className="flex items-start gap-2 text-sm text-apg-silver">
        <input type="checkbox" name="blocksWholeRoom" defaultChecked={blocksWholeRoom} />
        <span>Block whole room on calendar (single-tenant room)</span>
      </label>

      {state.error ? <p className="text-sm text-rose-300">{state.error}</p> : null}

      {state.ok && state.rentChanged && state.paymentLinkUrl ? (
        <div className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-3 text-sm text-sky-100">
          <p className="font-semibold">
            Rent updated — {paiseToInr(state.rentChanged.fromPaise)} →{' '}
            {paiseToInr(state.rentChanged.toPaise)}/mo
          </p>
          <p className="mt-1 text-xs">
            Pending invoices and action items were synced. Payment link generated.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <RentUpdatedWhatsAppButton
              customerName={customerName}
              phone={customerPhone}
              pgName={state.pgName ?? parsedTarget?.pgName ?? 'your PG'}
              newAmountPaise={state.rentChanged.toPaise}
              paymentLinkUrl={state.paymentLinkUrl}
            />
            <a
              href={state.paymentLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/5"
            >
              Open payment link →
            </a>
          </div>
        </div>
      ) : null}

      {state.ok && parsedTarget && bedChanged ? (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
          <p className="font-semibold">Assignment saved</p>
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
        title={bedChanged ? 'Reassign to this bed?' : 'Save assignment & rent?'}
        description={
          <div className="space-y-2">
            {bedChanged && selectedBed ? (
              <p>
                Move <strong>{customerName}</strong> to <strong>{selectedBed.label}</strong>.
                Occupancy updates immediately; double-booking is blocked if the bed is taken.
              </p>
            ) : (
              <p>Update rent, deposit, and room blocking for this tenant.</p>
            )}
            <p>
              Rent: <strong>{paiseToInr(currentMonthlyRentPaise)}/mo</strong>
              {bedChanged ? ' (edit field above if the new bed rate differs)' : null}
            </p>
            <p>
              Deposit on booking: <strong>{paiseToInr(currentDepositPaise)}</strong>
              {ledgerCollectedPaise > 0
                ? ` · Ledger collected ${paiseToInr(ledgerCollectedPaise)}`
                : null}
            </p>
            {bedChanged && parsedTarget ? (
              <p className="text-xs text-zinc-500">
                After saving, use WhatsApp to notify: &ldquo;Your bed has been assigned in{' '}
                {parsedTarget.pgName}&rdquo;
              </p>
            ) : null}
          </div>
        }
        confirmLabel={bedChanged ? 'Confirm reassignment' : 'Save changes'}
        tone={bedChanged ? 'danger' : 'default'}
        pending={pending}
        className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {pending ? 'Saving…' : bedChanged ? 'Reassign bed' : 'Save assignment & rent'}
      </AdminConfirmSubmit>
    </form>
  );
}
