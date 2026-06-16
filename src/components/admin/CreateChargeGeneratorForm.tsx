'use client';

import { useActionState, useEffect, useState } from 'react';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import {
  createResidentChargeAction,
  type ChargeGeneratorActionState,
} from '@/app/(admin)/admin/residents/[customerId]/chargeGeneratorActions';
import { CHARGE_DEFAULTS } from '@/src/lib/billing/chargeGeneratorConstants';
import { paiseToInr } from '@/src/lib/format';

const CHARGE_TYPES = [
  { value: 'additional_deposit', label: 'Additional deposit' },
  { value: 'rent_charge', label: 'Rent charge' },
  { value: 'electricity_charge', label: 'Electricity charge (coming soon)', disabled: true },
  { value: 'custom_charge', label: 'Custom charge' },
] as const;

const CUSTOM_KINDS = [
  { value: 'damage', label: 'Damage charge' },
  { value: 'penalty', label: 'Penalty' },
  { value: 'cleaning', label: 'Cleaning charge' },
  { value: 'maintenance', label: 'Maintenance charge' },
  { value: 'admin', label: 'Admin charge' },
  { value: 'custom', label: 'Other custom' },
] as const;

const idle: ChargeGeneratorActionState = { status: 'idle' };

export function CreateChargeGeneratorForm({
  customerId,
  bookingId,
}: {
  customerId: string;
  bookingId?: string | null;
}) {
  const [state, formAction, pending] = useActionState(createResidentChargeAction, idle);
  const [chargeType, setChargeType] = useState<string>('additional_deposit');
  const [title, setTitle] = useState(CHARGE_DEFAULTS.additional_deposit.title);
  const [description, setDescription] = useState(CHARGE_DEFAULTS.additional_deposit.description);

  useEffect(() => {
    if (chargeType === 'additional_deposit') {
      setTitle(CHARGE_DEFAULTS.additional_deposit.title);
      setDescription(CHARGE_DEFAULTS.additional_deposit.description);
    } else if (chargeType === 'rent_charge') {
      setTitle(CHARGE_DEFAULTS.rent_charge.title);
      setDescription(CHARGE_DEFAULTS.rent_charge.description);
    } else if (chargeType === 'custom_charge') {
      setTitle('');
      setDescription('');
    }
  }, [chargeType]);

  return (
    <form action={formAction} className="rounded-xl border border-white/10 bg-[#12161C] p-4">
      <input type="hidden" name="customerId" value={customerId} />
      {bookingId ? <input type="hidden" name="bookingId" value={bookingId} /> : null}
      <h3 className="text-sm font-semibold text-white">Generate charge</h3>
      <p className="mt-1 text-[11px] text-apg-silver">
        Creates a payment link with QR and WhatsApp share. Deposit charges update the deposit
        ledger; rent charges use rent invoicing; custom charges use financial invoices.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-apg-silver">
          Charge type
          <select
            name="chargeType"
            value={chargeType}
            onChange={(e) => setChargeType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          >
            {CHARGE_TYPES.map((t) => (
              <option key={t.value} value={t.value} disabled={'disabled' in t && t.disabled}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-apg-silver">
          Amount (₹)
          <input
            type="number"
            name="amountInr"
            min="0.01"
            step="0.01"
            required
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          />
        </label>

        {chargeType === 'custom_charge' ? (
          <label className="block text-xs text-apg-silver sm:col-span-2">
            Custom category
            <select
              name="customKind"
              defaultValue="custom"
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
            >
              {CUSTOM_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block text-xs text-apg-silver sm:col-span-2">
          Title
          <input
            type="text"
            name="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Charge title"
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-apg-silver sm:col-span-2">
          Description
          <textarea
            name="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-apg-silver">
          Due date
          <input
            type="date"
            name="dueDate"
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending || chargeType === 'electricity_charge'}
        className="mt-4 rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e04e18] disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create charge & payment link'}
      </button>

      {state.status === 'ok' ? (
        <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3">
          <p className="text-xs text-emerald-200">{state.message}</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {state.title} · {paiseToInr(state.amountPaise)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={state.paymentLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/5"
            >
              Open payment link
            </a>
            {state.whatsappShareUrl ? (
              <a
                href={state.whatsappShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-1.5 text-[11px] font-medium text-[#25D366] hover:bg-[#25D366]/20"
              >
                <WhatsAppIcon className="h-3.5 w-3.5" />
                WhatsApp
              </a>
            ) : null}
          </div>
          {state.qrUrl ? (
            <div className="mt-3 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.qrUrl}
                alt="Payment QR code"
                className="mx-auto max-h-40 rounded-lg bg-white p-2"
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {state.status === 'error' ? (
        <p className="mt-2 text-xs text-rose-300">{state.message}</p>
      ) : null}
    </form>
  );
}
