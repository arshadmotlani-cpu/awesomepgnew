'use client';

import { useState, useTransition } from 'react';
import {
  checkoutAppointmentAction,
  payInvoiceAction,
  setAppointmentStatusAction,
} from '@/src/hair/actions/appointments';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import {
  FYH_APPOINTMENT_STATUS_COLORS,
  getAllowedAppointmentStatusTransitions,
} from '@/src/hair/lib/appointmentStatus';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { CalendarAppointment, CustomerOpt } from './calendarTypes';
import { hasCustomAppointmentDuration } from './schedulerDuration';
import { StatusChip } from './schedulerUi';
import { formatHmInSalonTz, salonDayKeyFromUtc } from './schedulerTime';

type Props = {
  appointment: CalendarAppointment;
  customers: CustomerOpt[];
  timezone: string;
  onClose: () => void;
  onEdit: () => void;
  onFlash: (msg: string) => void;
  onError: (msg: string) => void;
  onRefresh: () => void;
};

export function AppointmentDetailDrawer({
  appointment: selected,
  customers,
  timezone,
  onClose,
  onEdit,
  onFlash,
  onError,
  onRefresh,
}: Props) {
  const [pending, startTransition] = useTransition();
  const customer = customers.find((c) => c.id === selected.customerId);
  const salesPaise = selected.services.reduce((s, x) => s + x.pricePaise, 0);
  const customDuration = hasCustomAppointmentDuration(
    selected.startAt,
    selected.endAt,
    selected.services,
  );
  const serviceDate = salonDayKeyFromUtc(new Date(selected.startAt), timezone);
  const startFmt = formatHmInSalonTz(new Date(selected.startAt), timezone);
  const endFmt = formatHmInSalonTz(new Date(selected.endAt), timezone);
  const bookingType = selected.source === 'walk_in' ? 'Walk-in' : 'Booking';
  const appointmentType = `${bookingType} · ${FYH_APPOINTMENT_STATUS_COLORS[selected.status].label}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 p-0 sm:p-4">
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-[color:var(--fyh-border)] bg-fyh-elevated p-5 shadow-2xl sm:rounded-2xl sm:border">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="fyh-display text-xl font-semibold truncate">{selected.customerName}</h2>
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <StatusChip status={selected.status} />
            {customDuration ? (
              <span className="text-xs text-fyh-accent">Custom duration</span>
            ) : null}
          </div>

          <dl className="space-y-2">
            <div>
              <dt className="text-xs text-fyh-text-muted">Customer</dt>
              <dd>{selected.customerName} · {selected.customerPhone}</dd>
            </div>
            <div>
              <dt className="text-xs text-fyh-text-muted">Appointment ID</dt>
              <dd className="font-mono text-xs">
                {selected.id.slice(0, 8)}…
                <button
                  type="button"
                  className="ml-2 text-fyh-accent underline"
                  onClick={() => navigator.clipboard.writeText(selected.id)}
                >
                  Copy
                </button>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fyh-text-muted">Services</dt>
              <dd>{selected.services.map((s) => s.name).join(', ') || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-fyh-text-muted">Stylist / resource</dt>
              <dd>
                {selected.staffName}
                {selected.resourceName ? ` · ${selected.resourceName}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fyh-text-muted">Sales price</dt>
              <dd>{formatInrFromPaise(salesPaise)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fyh-text-muted">Service date</dt>
              <dd>{serviceDate}</dd>
            </div>
            <div>
              <dt className="text-xs text-fyh-text-muted">Start / end / duration</dt>
              <dd>{startFmt} – {endFmt} · {selected.durationMinutes}m</dd>
            </div>
            <div>
              <dt className="text-xs text-fyh-text-muted">Booking type</dt>
              <dd>{bookingType}</dd>
            </div>
            <div>
              <dt className="text-xs text-fyh-text-muted">Appointment type</dt>
              <dd>{appointmentType}</dd>
            </div>
            {selected.createdByName ? (
              <div>
                <dt className="text-xs text-fyh-text-muted">Created by</dt>
                <dd>{selected.createdByName}</dd>
              </div>
            ) : null}
            {selected.notes ? (
              <div>
                <dt className="text-xs text-fyh-text-muted">Notes</dt>
                <dd className="italic text-fyh-text-secondary">{selected.notes}</dd>
              </div>
            ) : null}
          </dl>

          <div className="flex flex-wrap gap-2 pt-2">
            {getAllowedAppointmentStatusTransitions(selected.status).map((st) => (
              <Button
                key={st}
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const res = await setAppointmentStatusAction(selected.id, st);
                    if (res.error) onError(res.error);
                    else {
                      onFlash(res.success ?? 'Updated');
                      onRefresh();
                    }
                  });
                }}
              >
                {FYH_APPOINTMENT_STATUS_COLORS[st].label}
              </Button>
            ))}
          </div>

          {(selected.status === 'completed' ||
            selected.status === 'in_service' ||
            selected.status === 'arrived') &&
          !selected.invoiceId ? (
            <Button
              type="button"
              className="w-full"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const res = await checkoutAppointmentAction(selected.id);
                  if (res?.error) onError(res.error);
                });
              }}
            >
              Raise Sale
            </Button>
          ) : null}

          {selected.invoiceId ? (
            <InvoicePayBlock
              invoiceId={selected.invoiceId}
              customer={customer}
              onError={onError}
              onFlash={onFlash}
              onRefresh={onRefresh}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InvoicePayBlock({
  invoiceId,
  customer,
  onError,
  onFlash,
  onRefresh,
}: {
  invoiceId: string;
  customer?: CustomerOpt;
  onError: (msg: string) => void;
  onFlash: (msg: string) => void;
  onRefresh: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [cash, setCash] = useState('');
  const [upi, setUpi] = useState('');
  const [card, setCard] = useState('');
  const [wallet, setWallet] = useState('');

  return (
    <div className="space-y-2 rounded-xl border border-[color:var(--fyh-border)] p-3">
      <p className="fyh-kpi-label">Pay invoice</p>
      <p className="text-xs text-fyh-text-secondary">Invoice {invoiceId.slice(0, 8)}…</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className="fyh-label">Cash ₹</label>
          <Input value={cash} onChange={(e) => setCash(e.target.value)} />
        </div>
        <div>
          <label className="fyh-label">UPI ₹</label>
          <Input value={upi} onChange={(e) => setUpi(e.target.value)} />
        </div>
        <div>
          <label className="fyh-label">Card ₹</label>
          <Input value={card} onChange={(e) => setCard(e.target.value)} />
        </div>
        {(customer?.walletBalancePaise ?? 0) > 0 ? (
          <div>
            <label className="fyh-label">
              Wallet ₹ (avail {formatInrFromPaise(customer?.walletBalancePaise ?? 0)})
            </label>
            <Input value={wallet} onChange={(e) => setWallet(e.target.value)} />
          </div>
        ) : null}
      </div>
      <Button
        type="button"
        className="w-full"
        disabled={pending}
        onClick={() => {
          const payments = [
            { method: 'cash' as const, amountPaise: Math.round(Number(cash || 0) * 100) },
            { method: 'upi' as const, amountPaise: Math.round(Number(upi || 0) * 100) },
            { method: 'card' as const, amountPaise: Math.round(Number(card || 0) * 100) },
            { method: 'wallet' as const, amountPaise: Math.round(Number(wallet || 0) * 100) },
          ].filter((p) => p.amountPaise > 0);
          startTransition(async () => {
            const res = await payInvoiceAction(invoiceId, payments);
            if (res.error) onError(res.error);
            else {
              onFlash(res.success ?? 'Paid');
              onRefresh();
            }
          });
        }}
      >
        Record payment
      </Button>
    </div>
  );
}
