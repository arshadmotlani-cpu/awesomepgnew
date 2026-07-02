'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  expressWalkInSaleAction,
  getExpressBookingContextAction,
  listExpressWalkInBedsAction,
} from '@/app/(admin)/admin/quick-actions/actions';
import type {
  ExpressBookingResidentContext,
  ExpressWalkInBedOption,
  ExpressBookingStayType,
  ExpressBookingPaymentStatus,
} from '@/src/lib/admin/expressBookingTypes';
import { CurrentTenancyCard } from '@/src/components/admin/expressBooking/CurrentTenancyCard';
import { ExpressBookingReceipt } from '@/src/components/admin/expressBooking/ExpressBookingReceipt';
import { ExpressBookingSearchPanel } from '@/src/components/admin/expressBooking/ExpressBookingSearchPanel';
import {
  posGlassCard,
  posInputClass,
  posSegmentActive,
  posSegmentBase,
  posSegmentIdle,
} from '@/src/components/admin/expressBooking/expressBookingStyles';
import { useExpressBookingQuote } from '@/src/hooks/useExpressBookingQuote';
import type { AdminResidentSearchResult } from '@/src/lib/admin/residentSearchTypes';
import { defaultCheckOutDate } from '@/src/lib/dateDefaults';
import { todayString } from '@/src/lib/dates';
import { buildExpressWalkInWhatsAppUrl } from '@/src/lib/billing/expressWalkInWhatsApp';

function defaultCheckInDate(): string {
  return todayString();
}

export function ExpressBookingSheet({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  function handleClose() {
    if (onClose) onClose();
    else router.back();
  }
  const [ctx, setCtx] = useState<ExpressBookingResidentContext | null>(null);
  const [ctxLoading, startLoadCtx] = useTransition();

  const [isNewResident, setIsNewResident] = useState(false);
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [adminVerifiedKyc, setAdminVerifiedKyc] = useState(true);

  const [checkInDate, setCheckInDate] = useState(defaultCheckInDate());
  const [stayType, setStayType] = useState<ExpressBookingStayType>('continue');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [blocksWholeRoom, setBlocksWholeRoom] = useState(false);

  const [beds, setBeds] = useState<ExpressWalkInBedOption[]>([]);
  const [bedsLoading, setBedsLoading] = useState(false);
  const [selectedPgId, setSelectedPgId] = useState('');
  const [bedId, setBedId] = useState('');

  const [depositPaidInr, setDepositPaidInr] = useState('');
  const [useWalletCredit, setUseWalletCredit] = useState(false);
  const [walletCreditInr, setWalletCreditInr] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'bank_transfer' | 'other'>(
    'upi',
  );
  const [paymentStatus, setPaymentStatus] = useState<ExpressBookingPaymentStatus>('paid_in_full');
  const [amountReceivedInr, setAmountReceivedInr] = useState('');

  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isProcessing = submitting;
  const [success, setSuccess] = useState<{
    message: string;
    href: string;
    bookingCode: string;
    whatsAppUrl?: string | null;
  } | null>(null);

  const pgOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of beds) map.set(b.pgId, b.pgName);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [beds]);

  const filteredBeds = useMemo(
    () => (selectedPgId ? beds.filter((b) => b.pgId === selectedPgId) : beds),
    [beds, selectedPgId],
  );

  const selectedBed = beds.find((b) => b.bedId === bedId) ?? null;
  const hasIdentity = Boolean(fullName.trim() && phone.trim());

  const quoteEnabled = Boolean(bedId && checkInDate && (stayType === 'continue' || checkOutDate));

  const { quote, loading: quoteLoading, error: quoteError } = useExpressBookingQuote({
    bedId,
    checkInDate,
    checkOutDate,
    stayType,
    enabled: quoteEnabled,
  });

  useEffect(() => {
    if (stayType === 'fixed' && !checkOutDate) {
      setCheckOutDate(defaultCheckOutDate(checkInDate));
    }
  }, [stayType, checkInDate, checkOutDate]);

  useEffect(() => {
    setBedsLoading(true);
    void listExpressWalkInBedsAction(checkInDate).then((res) => {
      if (res.ok) setBeds(res.beds);
      setBedsLoading(false);
    });
  }, [checkInDate]);

  useEffect(() => {
    if (stayType === 'fixed') {
      setDepositPaidInr('');
      setUseWalletCredit(false);
      setWalletCreditInr('');
    }
  }, [stayType]);

  useEffect(() => {
    if (stayType !== 'continue' || !quote || depositPaidInr) return;
    if (quote.depositPaise > 0) {
      setDepositPaidInr(String(quote.depositPaise / 100));
    }
  }, [stayType, quote, depositPaidInr]);

  useEffect(() => {
    if (ctx && ctx.walletCreditPaise > 0 && stayType === 'continue') {
      setUseWalletCredit(true);
      setWalletCreditInr(String(ctx.walletCreditPaise / 100));
    }
  }, [ctx, stayType]);

  useEffect(() => {
    idempotencyKeyRef.current = null;
    setSubmitError(null);
  }, [customerId, bedId, checkInDate, stayType, checkOutDate, paymentStatus, paymentMethod]);

  function selectResident(row: AdminResidentSearchResult) {
    setIsNewResident(false);
    setCustomerId(row.id);
    setFullName(row.fullName);
    setPhone(row.phone ?? '');
    setSubmitError(null);
    setCtx(null);
    startLoadCtx(async () => {
      try {
        const res = await getExpressBookingContextAction(row.id);
        if ('error' in res) {
          setCtx(null);
          setSubmitError(res.error);
          return;
        }
        setCtx(res);
        if (res.activeTenancy?.bedId && res.activeTenancy.pgId) {
          setSelectedPgId(res.activeTenancy.pgId);
          setBedId(res.activeTenancy.bedId);
        }
      } catch (err) {
        setCtx(null);
        setSubmitError(
          err instanceof Error ? err.message : 'Failed to load resident context.',
        );
      }
    });
  }

  function beginNewResident(name: string) {
    setIsNewResident(true);
    setCustomerId(undefined);
    setCtx(null);
    setEmail('');
    setBedId('');
    const digits = name.replace(/\D/g, '');
    if (digits.length >= 10) {
      setPhone(name);
      setFullName('');
    } else {
      setFullName(name);
      setPhone('');
    }
  }

  function resetResident() {
    setCtx(null);
    setCustomerId(undefined);
    setFullName('');
    setPhone('');
    setEmail('');
    setIsNewResident(false);
    setBedId('');
  }

  function inrToNumber(value: string): number {
    const n = Number.parseFloat(value.replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function submitBooking() {
    if (submitInFlightRef.current || submitting) {
      setSubmitError('Booking is already in progress — please wait.');
      return;
    }
    if (!quote) {
      setSubmitError('Wait for pricing to load.');
      return;
    }
    if (!bedId) {
      setSubmitError('Select a bed.');
      return;
    }

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `express-${Date.now()}`;
    }

    setSubmitError(null);
    submitInFlightRef.current = true;
    startSubmit(async () => {
      try {
      const rentInr = quote.rentPaise / 100;
      const depositRequiredInr = stayType === 'continue' ? quote.depositPaise / 100 : 0;

      const res = await expressWalkInSaleAction({
        customerId,
        fullName,
        phone,
        email: email.trim() || undefined,
        gender,
        adminVerifiedKyc,
        bedId,
        checkInDate,
        stayType,
        checkOutDate: stayType === 'fixed' ? checkOutDate : null,
        blocksWholeRoom,
        rentAmountInr: rentInr,
        depositRequiredInr,
        depositPaidInr: stayType === 'continue' ? inrToNumber(depositPaidInr) : 0,
        rentPaidInr:
          paymentStatus === 'paid_in_full'
            ? rentInr
            : paymentStatus === 'partially_paid'
              ? inrToNumber(amountReceivedInr)
              : 0,
        walletCreditInr: useWalletCredit ? inrToNumber(walletCreditInr) : 0,
        paymentMethod,
        paymentStatus,
        amountReceivedInr:
          paymentStatus === 'partially_paid' ? inrToNumber(amountReceivedInr) : undefined,
        idempotencyKey: idempotencyKeyRef.current ?? undefined,
      });
      if (!res.ok) {
        setSubmitError(res.error);
        setConfirmOpen(false);
        idempotencyKeyRef.current = null;
        return;
      }

      idempotencyKeyRef.current = null;

      const whatsAppUrl =
        res.pgName && res.roomNumber && res.bedCode
          ? buildExpressWalkInWhatsAppUrl({
              residentName: fullName,
              phone,
              pgName: res.pgName,
              roomNumber: res.roomNumber,
              bedCode: res.bedCode,
              checkInDate,
              checkOutDate: stayType === 'fixed' ? checkOutDate : null,
              stayType,
              bookingCode: res.bookingCode ?? '',
              rentAmountPaise: quote.rentPaise,
              depositRequiredPaise: quote.depositPaise,
              depositPaidPaise: res.depositRecordedPaise ?? 0,
              rentPaidPaise: res.rentRecordedPaise ?? 0,
              balanceDuePaise: res.balanceDuePaise ?? 0,
              paymentMethod,
              bookingStatus: 'Confirmed',
              rentInvoiceNumber: res.rentInvoiceNumber,
            })
          : null;

      setConfirmOpen(false);
      setSuccess({
        message: res.message,
        href: res.href ?? `/admin/residents/${res.customerId ?? customerId}`,
        bookingCode: res.bookingCode ?? '',
        whatsAppUrl,
      });
      } finally {
        submitInFlightRef.current = false;
      }
    });
  }

  if (success) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="text-lg font-semibold text-emerald-300">Booking created</p>
        <p className="text-sm text-apg-silver">{success.message}</p>
        <p className="font-mono text-white">{success.bookingCode}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href={success.href}
            className="rounded-xl bg-[#FF5A1F] px-6 py-3 text-sm font-semibold text-white"
          >
            Open profile
          </Link>
          {success.whatsAppUrl ? (
            <a
              href={success.whatsAppUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-white/15 px-6 py-3 text-sm text-white"
            >
              Share WhatsApp
            </a>
          ) : null}
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-white/15 px-6 py-3 text-sm text-apg-silver"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const leftPanel = hasIdentity ? (
    <fieldset className="space-y-4" disabled={isProcessing}>
      <div className={`${posGlassCard} flex flex-wrap items-start justify-between gap-3`}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-apg-muted">
            {isNewResident ? 'New resident' : 'Existing resident'}
          </p>
          <p className="mt-1 text-xl font-semibold text-white">{fullName}</p>
          <p className="text-sm text-apg-silver">{phone}</p>
        </div>
        <button
          type="button"
          onClick={resetResident}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs text-apg-silver hover:text-white"
        >
          Change user
        </button>
      </div>

      {ctxLoading ? (
        <p className="text-sm text-apg-silver">Loading current assignment…</p>
      ) : ctx ? (
        <CurrentTenancyCard ctx={ctx} />
      ) : null}

      {isNewResident ? (
        <div className={posGlassCard}>
          <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">
            Resident details
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-apg-silver">
              Full name
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={posInputClass}
              />
            </label>
            <label className="block text-xs text-apg-silver">
              Phone
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={posInputClass}
              />
            </label>
            <label className="block text-xs text-apg-silver sm:col-span-2">
              Email (optional)
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={posInputClass}
              />
            </label>
            <label className="block text-xs text-apg-silver">
              Gender
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as typeof gender)}
                className={posInputClass}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <label className="mt-3 flex items-start gap-2 text-xs text-apg-silver">
            <input
              type="checkbox"
              checked={adminVerifiedKyc}
              onChange={(e) => setAdminVerifiedKyc(e.target.checked)}
              className="mt-0.5"
            />
            Verified by admin (skip OTP)
          </label>
        </div>
      ) : null}

      <div className={posGlassCard}>
        <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Stay type</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              ['fixed', 'Fixed Stay', 'Daily rental · check-in + check-out'],
              ['continue', 'Monthly Stay', 'Open-ended · deposit + monthly rent'],
            ] as const
          ).map(([value, title, desc]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStayType(value)}
              className={`rounded-xl border p-4 text-left transition ${
                stayType === value
                  ? 'border-[#FF5A1F]/50 bg-[#FF5A1F]/10'
                  : 'border-white/10 hover:border-white/20'
              }`}
            >
              <p className="font-semibold text-white">{title}</p>
              <p className="mt-1 text-xs text-apg-silver">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className={posGlassCard}>
        <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Dates</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-apg-silver">
            Check-in
            <input
              type="date"
              value={checkInDate}
              onChange={(e) => setCheckInDate(e.target.value)}
              className={posInputClass}
            />
          </label>
          {stayType === 'fixed' ? (
            <label className="block text-xs text-apg-silver">
              Check-out
              <input
                type="date"
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                className={posInputClass}
              />
            </label>
          ) : null}
        </div>
        {quote?.isHistorical ? (
          <p className="mt-2 text-xs text-amber-200/90">
            Historical check-in — invoice only, no bed reservation or occupancy change.
          </p>
        ) : null}
      </div>

      <div className={posGlassCard} id="express-bed-section">
        <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">
          {quote?.isHistorical && ctx?.activeTenancy
            ? 'Billing bed (reference)'
            : 'Assign bed'}
        </p>
        {bedsLoading ? (
          <p className="mt-2 text-sm text-apg-silver">Loading beds…</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-apg-silver">
              PG
              <select
                value={selectedPgId}
                onChange={(e) => {
                  setSelectedPgId(e.target.value);
                  setBedId('');
                }}
                className={posInputClass}
              >
                <option value="">All PGs</option>
                {pgOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-apg-silver">
              Bed
              <select
                value={bedId}
                onChange={(e) => setBedId(e.target.value)}
                className={posInputClass}
              >
                <option value="">Select bed</option>
                {filteredBeds.map((b) => (
                  <option key={b.bedId} value={b.bedId}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <label className="mt-3 flex items-center gap-2 text-xs text-apg-silver">
          <input
            type="checkbox"
            checked={blocksWholeRoom}
            onChange={(e) => setBlocksWholeRoom(e.target.checked)}
          />
          Block whole room availability
        </label>
        {quoteLoading ? <p className="mt-2 text-xs text-apg-silver">Calculating rent…</p> : null}
        {quoteError ? (
        <p className="mt-2 text-xs text-rose-300" role="alert">
          {quoteError}
        </p>
      ) : null}
      </div>

      {stayType === 'continue' ? (
        <div className={posGlassCard}>
          <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">
            Deposit (monthly only)
          </p>
          <label className="mt-3 block text-xs text-apg-silver">
            Deposit collected (₹)
            <input
              type="number"
              min="0"
              step="0.01"
              value={depositPaidInr}
              onChange={(e) => setDepositPaidInr(e.target.value)}
              className={posInputClass}
              readOnly={Boolean(quote)}
            />
          </label>
          {ctx && ctx.walletCreditPaise > 0 ? (
            <label className="mt-3 flex items-center gap-2 text-xs text-apg-silver">
              <input
                type="checkbox"
                checked={useWalletCredit}
                onChange={(e) => setUseWalletCredit(e.target.checked)}
              />
              Apply wallet credit (₹{(ctx.walletCreditPaise / 100).toLocaleString('en-IN')})
            </label>
          ) : null}
        </div>
      ) : null}

      <div className={`${posGlassCard} lg:hidden`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Payment</p>
        <PaymentControls
          paymentStatus={paymentStatus}
          setPaymentStatus={setPaymentStatus}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          amountReceivedInr={amountReceivedInr}
          setAmountReceivedInr={setAmountReceivedInr}
          disabled={isProcessing}
        />
      </div>
    </fieldset>
  ) : null;

  const confirmPanel = confirmOpen ? (
    <div className={`${posGlassCard} border-[#FF5A1F]/30`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#FF5A1F]">
        Step 2 of 2
      </p>
      <p className="mt-1 text-lg font-semibold text-white">Confirm booking</p>
      <p className="mt-2 text-sm text-apg-silver">
        Create {stayType === 'fixed' ? 'fixed stay' : 'monthly stay'} for {fullName}? This will
        create the booking, invoice, and payment records.
      </p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => setConfirmOpen(false)}
          className="flex-1 rounded-xl border border-white/10 py-3 text-sm text-apg-silver disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          disabled={isProcessing}
          onClick={submitBooking}
          className="flex-1 rounded-xl bg-[#FF5A1F] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isProcessing ? 'Creating booking…' : 'Confirm & create'}
        </button>
      </div>
    </div>
  ) : null;

  const rightPanel = hasIdentity ? (
    <div className="space-y-4 lg:sticky lg:top-4">
      <ExpressBookingReceipt
        residentName={fullName}
        ctx={ctx}
        stayType={stayType}
        quote={quote}
        depositPaidPaise={Math.round(inrToNumber(depositPaidInr) * 100)}
        amountReceivedPaise={Math.round(inrToNumber(amountReceivedInr) * 100)}
        paymentStatus={paymentStatus}
        selectedBedLabel={selectedBed?.label ?? null}
      />
      <div className={`${posGlassCard} hidden lg:block`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Payment</p>
        <PaymentControls
          paymentStatus={paymentStatus}
          setPaymentStatus={setPaymentStatus}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          amountReceivedInr={amountReceivedInr}
          setAmountReceivedInr={setAmountReceivedInr}
          disabled={isProcessing}
        />
      </div>
      {confirmPanel}
      {!confirmOpen ? (
        <div className="hidden lg:block">
          <button
            type="button"
            disabled={isProcessing || !quote || !bedId}
            onClick={() => setConfirmOpen(true)}
            className="w-full rounded-xl bg-[#FF5A1F] py-4 text-base font-semibold text-white hover:brightness-110 disabled:opacity-40"
          >
            {isProcessing ? 'Creating booking…' : 'Continue to confirm'}
          </button>
          <p className="mt-2 text-center text-xs text-apg-muted">
            Step 1 of 2 — you will review and confirm before anything is created
          </p>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="-mx-3 -my-4 flex min-h-[calc(100dvh-3.5rem)] flex-col bg-[#0B0F14] sm:-mx-4 sm:-my-6 lg:-mx-8 lg:-my-8">
      <header className="shrink-0 border-b border-white/10 bg-[#0B0F14]/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white sm:text-2xl">Express Booking</h1>
            <p className="text-sm text-apg-silver">Walk-in booking & invoice workspace</p>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-apg-silver hover:text-white disabled:opacity-40"
          >
            Back
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        {submitError ? (
          <div
            className="mx-auto mb-4 w-full max-w-6xl rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
            role="alert"
          >
            {submitError}
          </div>
        ) : null}
        {!hasIdentity ? (
          <div className="mx-auto w-full max-w-6xl">
            <ExpressBookingSearchPanel
              variant="hero"
              onSelect={selectResident}
              onCreateNew={beginNewResident}
            />
          </div>
        ) : (
          <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <div className="min-w-0">{leftPanel}</div>
            <div className="min-w-0">{rightPanel}</div>
          </div>
        )}
      </div>

      {hasIdentity && !confirmOpen ? (
        <div className="shrink-0 border-t border-white/10 bg-[#0B0F14] p-4 lg:hidden">
          <button
            type="button"
            disabled={isProcessing || !quote || !bedId}
            onClick={() => setConfirmOpen(true)}
            className="w-full rounded-xl bg-[#FF5A1F] py-4 text-base font-semibold text-white disabled:opacity-40"
          >
            {isProcessing ? 'Creating booking…' : 'Continue to confirm'}
          </button>
          <p className="mt-2 text-center text-xs text-apg-muted">
            Step 1 of 2 — review and confirm before creating
          </p>
        </div>
      ) : null}

      {hasIdentity && confirmOpen ? (
        <div className="shrink-0 border-t border-white/10 bg-[#0B0F14] p-4 lg:hidden">
          {confirmPanel}
        </div>
      ) : null}
    </div>
  );
}

function PaymentControls({
  paymentStatus,
  setPaymentStatus,
  paymentMethod,
  setPaymentMethod,
  amountReceivedInr,
  setAmountReceivedInr,
  disabled = false,
}: {
  paymentStatus: ExpressBookingPaymentStatus;
  setPaymentStatus: (v: ExpressBookingPaymentStatus) => void;
  paymentMethod: 'cash' | 'upi' | 'bank_transfer' | 'other';
  setPaymentMethod: (v: 'cash' | 'upi' | 'bank_transfer' | 'other') => void;
  amountReceivedInr: string;
  setAmountReceivedInr: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-3 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        {(
          [
            ['paid_in_full', 'Paid in full'],
            ['partially_paid', 'Partially paid'],
            ['due_bill', 'Generate due bill'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={disabled}
            onClick={() => setPaymentStatus(value)}
            className={`${posSegmentBase} ${paymentStatus === value ? posSegmentActive : posSegmentIdle} disabled:opacity-40`}
          >
            {label}
          </button>
        ))}
      </div>
      {paymentStatus === 'partially_paid' ? (
        <label className="block text-xs text-apg-silver">
          Amount received (₹)
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amountReceivedInr}
            onChange={(e) => setAmountReceivedInr(e.target.value)}
            className={posInputClass}
            disabled={disabled}
          />
        </label>
      ) : null}
      <label className="block text-xs text-apg-silver">
        Payment method
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
          className={posInputClass}
          disabled={disabled}
        >
          <option value="upi">UPI</option>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="other">Other</option>
        </select>
      </label>
    </div>
  );
}
