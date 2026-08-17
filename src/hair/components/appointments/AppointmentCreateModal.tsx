'use client';

import { useActionState, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  createAppointmentAction,
  type ApptActionState,
} from '@/src/hair/actions/appointments';
import {
  addAdvanceFromBookingAction,
  loadCustomerBookingContextAction,
  searchServicesForBookingAction,
} from '@/src/hair/actions/booking';
import { FyhCustomerSearch } from '@/src/hair/components/booking/FyhCustomerSearch';
import { FyhCustomerContextStrip } from '@/src/hair/components/customers/FyhCustomerContextStrip';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import { FYH_APPOINTMENT_STATUS_COLORS } from '@/src/hair/lib/appointmentStatus';
import type { FyhAppointmentStatus } from '@/src/hair/db/schema/appointments';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { AdvancePaymentMethod } from '@/src/hair/services/loyaltyOps';
import type { BookingServiceHit, CustomerBookingContext } from '@/src/hair/services/bookingContext';
import { formatSalonDisplayDate } from '@/src/hair/lib/formatSalonDate';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';
import type {
  CreateSlotPrefill,
  ResourceOpt,
  StaffOpt,
} from './calendarTypes';
import { minutesToSlotLabel } from './schedulerConstants';
import { formatHmInSalonTz, utcFromDayAndMinutes } from './schedulerTime';

type BasketLine = {
  key: string;
  serviceId: string;
  name: string;
  durationMinutes: number;
  pricePaise: number;
  staffId: string;
};

const CREATE_INITIAL: ApptActionState = {};

const PAYMENT_METHODS: { id: AdvancePaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
  { id: 'bank', label: 'Bank' },
];

const CREATE_STATUSES: FyhAppointmentStatus[] = ['booked', 'confirmed', 'arrived'];

type Props = {
  open: boolean;
  onClose: () => void;
  prefill: CreateSlotPrefill | null;
  staff: StaffOpt[];
  resources: ResourceOpt[];
  timezone: string;
  preselectCustomerId?: string | null;
  onSuccess: () => void;
};

export function AppointmentCreateModal({
  open,
  onClose,
  prefill,
  staff,
  resources,
  timezone,
  preselectCustomerId,
  onSuccess,
}: Props) {
  const [createState, createAction, createPending] = useActionState(
    createAppointmentAction,
    CREATE_INITIAL,
  );
  const [advancePending, startAdvance] = useTransition();

  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomerHit | null>(null);
  const [bookingContext, setBookingContext] = useState<CustomerBookingContext | null>(null);

  const [serviceQuery, setServiceQuery] = useState('');
  const [serviceHits, setServiceHits] = useState<BookingServiceHit[]>([]);
  const [serviceSearching, setServiceSearching] = useState(false);
  const [basket, setBasket] = useState<BasketLine[]>([]);

  const [sameStaffForAll, setSameStaffForAll] = useState(true);
  const [appointmentStaffId, setAppointmentStaffId] = useState(prefill?.staffId ?? staff[0]?.id ?? '');
  const [resourceId, setResourceId] = useState('');
  const [consultedByStaffId, setConsultedByStaffId] = useState('');
  const [status, setStatus] = useState<FyhAppointmentStatus>('booked');
  const [walkIn, setWalkIn] = useState(false);
  const [recurrenceWeeks, setRecurrenceWeeks] = useState('1');
  const [notes, setNotes] = useState('');

  const [advanceRupees, setAdvanceRupees] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<AdvancePaymentMethod>('cash');
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [advanceSuccess, setAdvanceSuccess] = useState<string | null>(null);

  const startMinutes = prefill?.startMinutes ?? 10 * 60;
  const dayIso = prefill?.dayIso ?? '';
  const slotStaffId = prefill?.staffId ?? staff[0]?.id ?? '';

  useEffect(() => {
    if (prefill?.staffId) setAppointmentStaffId(prefill.staffId);
  }, [prefill?.staffId]);

  useEffect(() => {
    if (!open) return;
    if (preselectCustomerId && !selectedCustomer) {
      loadCustomerBookingContextAction(preselectCustomerId).then((ctx) => {
        setBookingContext(ctx);
        setSelectedCustomer({
          id: ctx.customer.id,
          fullName: ctx.customer.fullName,
          phone: ctx.customer.phone,
          customerCode: null,
          walletBalancePaise: ctx.customer.walletBalancePaise,
        });
      });
    }
  }, [open, preselectCustomerId, selectedCustomer]);

  useEffect(() => {
    if (createState.success) {
      onSuccess();
      onClose();
    }
  }, [createState.success, onClose, onSuccess]);

  useEffect(() => {
    const q = serviceQuery.trim();
    if (q.length < 1) {
      setServiceHits([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setServiceSearching(true);
      try {
        setServiceHits(await searchServicesForBookingAction(q));
      } finally {
        setServiceSearching(false);
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [serviceQuery]);

  const refreshCustomerContext = useCallback(async (customerId: string) => {
    const ctx = await loadCustomerBookingContextAction(customerId);
    setBookingContext(ctx);
    setSelectedCustomer((prev) =>
      prev
        ? { ...prev, walletBalancePaise: ctx.customer.walletBalancePaise }
        : {
            id: ctx.customer.id,
            fullName: ctx.customer.fullName,
            phone: ctx.customer.phone,
            customerCode: null,
            walletBalancePaise: ctx.customer.walletBalancePaise,
          },
    );
  }, []);

  const handleCustomerSelect = async (hit: PosCustomerHit) => {
    setSelectedCustomer(hit);
    await refreshCustomerContext(hit.id);
  };

  const addServiceToBasket = (hit: BookingServiceHit) => {
    if (basket.some((b) => b.serviceId === hit.id)) return;
    const staffForLine = sameStaffForAll ? appointmentStaffId : slotStaffId;
    setBasket((prev) => [
      ...prev,
      {
        key: `${hit.id}-${Date.now()}`,
        serviceId: hit.id,
        name: hit.name,
        durationMinutes: hit.durationMinutes,
        pricePaise: hit.pricePaise,
        staffId: staffForLine,
      },
    ]);
  };

  const removeFromBasket = (key: string) => {
    setBasket((prev) => prev.filter((b) => b.key !== key));
  };

  const updateLineStaff = (key: string, staffId: string) => {
    setBasket((prev) => prev.map((b) => (b.key === key ? { ...b, staffId } : b)));
  };

  useEffect(() => {
    if (!sameStaffForAll) return;
    setBasket((prev) => prev.map((b) => ({ ...b, staffId: appointmentStaffId })));
  }, [sameStaffForAll, appointmentStaffId]);

  const durationMinutes = useMemo(
    () => basket.reduce((sum, b) => sum + b.durationMinutes, 0),
    [basket],
  );
  const servicesTotalPaise = useMemo(
    () => basket.reduce((sum, b) => sum + b.pricePaise, 0),
    [basket],
  );

  const startAtIso = prefill
    ? utcFromDayAndMinutes(dayIso, startMinutes, timezone).toISOString()
    : '';
  const endMinutes = startMinutes + durationMinutes;
  const endAtPreview =
    prefill && durationMinutes > 0
      ? utcFromDayAndMinutes(dayIso, endMinutes, timezone)
      : null;

  const walletPaise = bookingContext?.financial.walletPaise ?? selectedCustomer?.walletBalancePaise ?? 0;
  const balanceDuePaise = Math.max(0, servicesTotalPaise - walletPaise);

  const staffAssignmentsNote = useMemo(() => {
    if (sameStaffForAll || basket.length === 0) return '';
    const parts = basket.map((b) => {
      const name = staff.find((s) => s.id === b.staffId)?.fullName ?? '—';
      return `${b.name}: ${name}`;
    });
    return `Service staff: ${parts.join('; ')}`;
  }, [basket, sameStaffForAll, staff]);

  const consultedNote = consultedByStaffId
    ? `Consulted by: ${staff.find((s) => s.id === consultedByStaffId)?.fullName ?? '—'}`
    : '';

  const combinedNotes = [notes.trim(), consultedNote, staffAssignmentsNote]
    .filter(Boolean)
    .join('\n');

  const handleAddAdvance = () => {
    if (!selectedCustomer) return;
    const rupees = Number(advanceRupees);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setAdvanceError('Enter a valid advance amount');
      return;
    }
    setAdvanceError(null);
    setAdvanceSuccess(null);
    startAdvance(async () => {
      try {
        await addAdvanceFromBookingAction({
          customerId: selectedCustomer.id,
          amountPaise: Math.round(rupees * 100),
          method: advanceMethod,
        });
        setAdvanceRupees('');
        setAdvanceSuccess('Advance added to customer wallet');
        await refreshCustomerContext(selectedCustomer.id);
      } catch (e) {
        setAdvanceError(e instanceof Error ? e.message : 'Failed to add advance');
      }
    });
  };

  if (!open) return null;

  const displayDate = dayIso ? formatSalonDisplayDate(dayIso) : '—';
  const canSubmit = selectedCustomer && basket.length > 0 && !createPending;

  return (
    <>
      <div
        className="fyh-modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="fyh-modal-panel fyh-booking-modal sm:max-w-[min(92vw,1100px)]"
          role="dialog"
          aria-labelledby="booking-modal-title"
        >
          <header className="fyh-modal-header flex items-center justify-between">
            <h2 id="booking-modal-title" className="fyh-modal-title">
              New appointment
            </h2>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </header>

          <div className="fyh-modal-body">
            <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
              <section className="space-y-3">
                <div>
                  <p className="fyh-section-eyebrow">Client search</p>
                  {selectedCustomer ? (
                    <div className="mt-2 space-y-2">
                      <div className="fyh-card !p-3">
                        <p className="font-semibold text-fyh-text">{selectedCustomer.fullName}</p>
                        <p className="text-sm text-fyh-text-secondary">{selectedCustomer.phone}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-1"
                          onClick={() => {
                            setSelectedCustomer(null);
                            setBookingContext(null);
                          }}
                        >
                          Change customer
                        </Button>
                      </div>
                      <FyhCustomerContextStrip
                        customerId={selectedCustomer.id}
                        customerName={selectedCustomer.fullName}
                        variant="compact"
                      />
                    </div>
                  ) : (
                    <FyhCustomerSearch
                      className="mt-2"
                      autoFocus
                      createContext="appointment_booking"
                      onSelect={handleCustomerSelect}
                    />
                  )}
                </div>

                {prefill ? (
                  <div className="fyh-card grid gap-2 sm:grid-cols-5 !p-3">
                    <div>
                      <p className="fyh-label">Date</p>
                      <p className="font-semibold text-fyh-text">{displayDate}</p>
                    </div>
                    <div>
                      <p className="fyh-label">Staff</p>
                      <select
                        value={appointmentStaffId}
                        onChange={(e) => setAppointmentStaffId(e.target.value)}
                        className="fyh-select mt-0.5 !h-9"
                      >
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>{s.fullName}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="fyh-label">Start</p>
                      <p className="font-semibold text-fyh-text">{minutesToSlotLabel(startMinutes)}</p>
                    </div>
                    <div>
                      <p className="fyh-label">End</p>
                      <p className="font-semibold text-fyh-text">
                        {endAtPreview
                          ? formatHmInSalonTz(endAtPreview, timezone)
                          : minutesToSlotLabel(startMinutes)}
                      </p>
                    </div>
                    <div>
                      <p className="fyh-label">Chair</p>
                      <select
                        value={resourceId}
                        onChange={(e) => setResourceId(e.target.value)}
                        className="fyh-select mt-0.5 !h-9"
                      >
                        <option value="">None</option>
                        {resources.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : null}

                <div>
                  <p className="fyh-section-eyebrow">Service search</p>
                  <Input
                    className="mt-2"
                    placeholder="Search services…"
                    value={serviceQuery}
                    onChange={(e) => setServiceQuery(e.target.value)}
                    aria-label="Search services"
                  />
                  {serviceQuery.trim().length >= 1 ? (
                    <ul className="mt-2 divide-y divide-[color:var(--fyh-border)] overflow-hidden rounded-[var(--fyh-radius)] border border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-elevated)]">
                      {serviceSearching ? (
                        <li className="px-3 py-3 text-center text-sm text-fyh-text-muted">Searching…</li>
                      ) : serviceHits.length > 0 ? (
                        serviceHits.map((hit) => {
                          const inBasket = basket.some((b) => b.serviceId === hit.id);
                          return (
                            <li
                              key={hit.id}
                              className="flex items-center justify-between gap-3 px-3 py-2.5"
                            >
                              <div>
                                <p className="font-semibold text-fyh-text">{hit.name}</p>
                                <p className="text-xs text-fyh-text-secondary">
                                  {hit.durationMinutes} min · {formatInrFromPaise(hit.pricePaise)}
                                  {hit.category ? ` · ${hit.category}` : ''}
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                disabled={inBasket}
                                onClick={() => addServiceToBasket(hit)}
                              >
                                {inBasket ? 'Added' : '+ Add'}
                              </Button>
                            </li>
                          );
                        })
                      ) : (
                        <li className="px-3 py-3 text-center text-sm text-fyh-text-muted">
                          No services found
                        </li>
                      )}
                    </ul>
                  ) : null}
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <p className="fyh-section-eyebrow">Selected services</p>
                    <label className="flex items-center gap-2 text-xs text-fyh-text-secondary">
                      <input
                        type="checkbox"
                        checked={sameStaffForAll}
                        onChange={(e) => setSameStaffForAll(e.target.checked)}
                        className="fyh-checkbox"
                      />
                      Same staff for all
                    </label>
                  </div>
                  {basket.length === 0 ? (
                    <p className="mt-2 text-sm text-fyh-text-muted">Add services from search above</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {basket.map((line, idx) => (
                        <li
                          key={line.key}
                          className="flex flex-wrap items-center gap-2 rounded-[var(--fyh-radius)] border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg-elevated)] px-3 py-2"
                        >
                          <span className="text-fyh-text-muted">{idx + 1}.</span>
                          <span className="min-w-0 flex-1 font-semibold text-fyh-text">{line.name}</span>
                          <span className="text-xs text-fyh-text-secondary">{line.durationMinutes}m</span>
                          <span className="text-sm font-semibold text-fyh-text">
                            {formatInrFromPaise(line.pricePaise)}
                          </span>
                          {!sameStaffForAll ? (
                            <select
                              value={line.staffId}
                              onChange={(e) => updateLineStaff(line.key, e.target.value)}
                              className="fyh-select !h-8 !w-auto text-xs"
                            >
                              {staff.map((s) => (
                                <option key={s.id} value={s.id}>{s.fullName}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-fyh-text-muted">
                              {staff.find((s) => s.id === line.staffId)?.fullName}
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFromBasket(line.key)}
                          >
                            ×
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="fyh-label">Consulted by</label>
                    <select
                      value={consultedByStaffId}
                      onChange={(e) => setConsultedByStaffId(e.target.value)}
                      className="fyh-select mt-1"
                    >
                      <option value="">—</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>{s.fullName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="fyh-label">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as FyhAppointmentStatus)}
                      className="fyh-select mt-1"
                    >
                      {CREATE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {FYH_APPOINTMENT_STATUS_COLORS[s].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 text-sm text-fyh-text-secondary">
                    <input
                      type="checkbox"
                      checked={walkIn}
                      onChange={(e) => {
                        setWalkIn(e.target.checked);
                        if (e.target.checked) setStatus('arrived');
                      }}
                      className="fyh-checkbox"
                    />
                    Walk-in
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-fyh-text-secondary">Repeat weeks</label>
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={recurrenceWeeks}
                      onChange={(e) => setRecurrenceWeeks(e.target.value)}
                      className="h-9 w-20"
                    />
                  </div>
                </div>

                <div>
                  <label className="fyh-label">Notes</label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Appointment notes"
                    className="mt-1"
                  />
                </div>
              </section>

              <aside className="space-y-3">
                <div className="fyh-card !p-3">
                  <p className="fyh-section-eyebrow">Payment summary</p>
                  <dl className="mt-2 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-fyh-text-secondary">Services</dt>
                      <dd className="font-semibold text-fyh-text">
                        {formatInrFromPaise(servicesTotalPaise)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-fyh-text-secondary">Available credit</dt>
                      <dd className="font-semibold text-fyh-text">{formatInrFromPaise(walletPaise)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-[color:var(--fyh-border)] pt-2">
                      <dt className="text-fyh-text-secondary">Balance due at checkout</dt>
                      <dd className="text-base font-semibold text-fyh-accent">
                        {formatInrFromPaise(balanceDuePaise)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-fyh-text-muted">
                    Wallet credit is applied at checkout. Advance payments increase available credit.
                  </p>
                </div>

                {selectedCustomer ? (
                  <div className="fyh-card space-y-2 !p-3">
                    <p className="fyh-section-eyebrow">Advance / payment</p>
                    <div>
                      <label className="fyh-label">Advance amount ₹</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={advanceRupees}
                        onChange={(e) => setAdvanceRupees(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="fyh-label">Payment method</label>
                      <select
                        value={advanceMethod}
                        onChange={(e) =>
                          setAdvanceMethod(e.target.value as AdvancePaymentMethod)
                        }
                        className="fyh-select mt-1"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    {advanceError ? (
                      <p className="text-sm text-fyh-danger">{advanceError}</p>
                    ) : null}
                    {advanceSuccess ? (
                      <p className="text-sm text-fyh-success">{advanceSuccess}</p>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      disabled={advancePending}
                      onClick={handleAddAdvance}
                    >
                      {advancePending ? 'Saving…' : 'Add advance'}
                    </Button>
                  </div>
                ) : null}
              </aside>
            </div>
          </div>

          <footer className="fyh-modal-footer">
            {createState.error ? (
              <p className="mb-2 text-sm text-fyh-danger">{createState.error}</p>
            ) : null}
            <form action={createAction} className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {prefill ? <input type="hidden" name="startAt" value={startAtIso} /> : null}
              <input type="hidden" name="staffId" value={appointmentStaffId} />
              <input type="hidden" name="resourceId" value={resourceId} />
              {selectedCustomer ? (
                <input type="hidden" name="customerId" value={selectedCustomer.id} />
              ) : null}
              {basket.map((b) => (
                <input key={b.key} type="hidden" name="serviceIds" value={b.serviceId} />
              ))}
              {walkIn ? <input type="hidden" name="source" value="walk_in" /> : null}
              <input type="hidden" name="recurrenceWeeks" value={recurrenceWeeks} />
              <input type="hidden" name="notes" value={combinedNotes} />
              <input type="hidden" name="status" value={status} />
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {createPending ? 'Creating…' : 'Create appointment'}
              </Button>
            </form>
          </footer>
        </div>
      </div>
    </>
  );
}
