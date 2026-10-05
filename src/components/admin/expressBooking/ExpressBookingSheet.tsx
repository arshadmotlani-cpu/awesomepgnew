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
import { expressSaleInvoiceHref } from '@/src/lib/expressBooking/expressSaleLinks';
import { buildExpressWalkInWhatsAppUrl } from '@/src/lib/billing/expressWalkInWhatsApp';
import {
  saleIntentLabel,
  type ExpressBookingSaleIntent,
} from '@/src/lib/expressBooking/expressBookingSaleIntent';
import { paiseToInr } from '@/src/lib/format';

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
  const [saleIntent, setSaleIntent] = useState<ExpressBookingSaleIntent>('sale');

  const [checkInDate, setCheckInDate] = useState(defaultCheckInDate());
  const [stayType, setStayType] = useState<ExpressBookingStayType>('continue');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [blocksWholeRoom, setBlocksWholeRoom] = useState(false);

  const [beds, setBeds] = useState<ExpressWalkInBedOption[]>([]);
  const [bedsLoading, setBedsLoading] = useState(false);
  const [selectedPgId, setSelectedPgId] = useState('');
  const [bedId, setBedId] = useState('');

  const [depositRequiredInr, setDepositRequiredInr] = useState('');
  const [depositPaidInr, setDepositPaidInr] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(defaultCheckInDate());
  const [payerName, setPayerName] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
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
    if (stayType !== 'continue' || !quote) return;
    const defaultDeposit = String(quote.depositPaise / 100);
    if (!depositRequiredInr) setDepositRequiredInr(defaultDeposit);
    if (!depositPaidInr && quote.depositPaise > 0) {
      setDepositPaidInr(defaultDeposit);
    }
  }, [stayType, quote, depositPaidInr, depositRequiredInr]);

  useEffect(() => {
    if (saleIntent === 'manual_onboarding') {
      setStayType('continue');
    }
  }, [saleIntent]);

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
      const depositRequired =
        stayType === 'continue'
          ? inrToNumber(depositRequiredInr || String(quote.depositPaise / 100))
          : 0;
      const depositPaid =
        stayType === 'continue' ? inrToNumber(depositPaidInr) : 0;

      if (saleIntent === 'manual_onboarding' && isNewResident && !adminVerifiedKyc) {
        setSubmitError('Confirm admin-verified KYC before onboarding a new resident.');
        setConfirmOpen(false);
        idempotencyKeyRef.current = null;
        return;
      }
      if (
        saleIntent === 'manual_onboarding' &&
        paymentMethod === 'bank_transfer' &&
        paymentStatus !== 'due_bill' &&
        !paymentReference.trim()
      ) {
        setSubmitError('Enter a payment reference for bank transfer.');
        setConfirmOpen(false);
        idempotencyKeyRef.current = null;
        return;
      }

      const res = await expressWalkInSaleAction({
        saleIntent,
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
        depositRequiredInr: depositRequired,
        depositPaidInr: depositPaid,
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
        paymentReference: paymentReference.trim() || undefined,
        paymentDate: paymentDate.trim() || undefined,
        payerName: payerName.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
        idempotencyKey: idempotencyKeyRef.current ?? undefined,
      });
      if (!res.ok) {
        setSubmitError(res.error);
        setConfirmOpen(false);
        idempotencyKeyRef.current = null;
        return;
      }

      idempotencyKeyRef.current = null;

      setConfirmOpen(false);

      if (res.financialInvoiceId) {
        router.push(expressSaleInvoiceHref(res.financialInvoiceId));
        return;
      }

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
            Security deposit
          </p>
          {quote ? (
            <p className="mt-1 text-xs text-apg-silver">
              Catalog default: {paiseToInr(quote.depositPaise)}
            </p>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-apg-silver">
              Deposit obligation (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                value={depositRequiredInr}
                onChange={(e) => setDepositRequiredInr(e.target.value)}
                className={posInputClass}
                readOnly={saleIntent === 'sale' && Boolean(quote)}
              />
            </label>
            <label className="block text-xs text-apg-silver">
              Deposit collected now (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                value={depositPaidInr}
                onChange={(e) => setDepositPaidInr(e.target.value)}
                className={posInputClass}
              />
            </label>
          </div>
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
          paymentReference={paymentReference}
          setPaymentReference={setPaymentReference}
          paymentDate={paymentDate}
          setPaymentDate={setPaymentDate}
          payerName={payerName}
          setPayerName={setPayerName}
          paymentNotes={paymentNotes}
          setPaymentNotes={setPaymentNotes}
          disabled={isProcessing}
        />
      </div>
    </fieldset>
  ) : null;

  const depositRequiredPaiseForPreview =
    stayType === 'continue'
      ? Math.round(
          inrToNumber(depositRequiredInr || (quote ? String(quote.depositPaise / 100) : '0')) *
            100,
        )
      : 0;
  const depositPaidPaisePreview = Math.round(inrToNumber(depositPaidInr) * 100);
  const rentPaisePreview = quote?.rentPaise ?? 0;
  const dueNowPaise =
    rentPaisePreview +
    depositRequiredPaiseForPreview -
    (paymentStatus === 'paid_in_full'
      ? rentPaisePreview
      : paymentStatus === 'partially_paid'
        ? Math.round(inrToNumber(amountReceivedInr) * 100)
        : 0) -
    depositPaidPaisePreview;

  const confirmPanel = confirmOpen ? (
    <div className={`${posGlassCard} border-[#FF5A1F]/30`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#FF5A1F]">
        Confirm
      </p>
      <p className="mt-1 text-lg font-semibold text-white">
        {saleIntent === 'manual_onboarding' ? 'Onboard resident' : 'Confirm booking'}
      </p>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-apg-silver">Resident</dt>
          <dd className="text-right text-white">{fullName}</dd>
        </div>
        {selectedBed?.label ? (
          <div className="flex justify-between gap-4">
            <dt className="text-apg-silver">Room / bed</dt>
            <dd className="text-right text-white">{selectedBed.label}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-apg-silver">Check-in</dt>
          <dd className="text-white">{checkInDate}</dd>
        </div>
        {quote ? (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-apg-silver">Monthly rent</dt>
              <dd className="text-white">{paiseToInr(rentPaisePreview)}</dd>
            </div>
            {stayType === 'continue' ? (
              <div className="flex justify-between gap-4">
                <dt className="text-apg-silver">Security deposit</dt>
                <dd className="text-white">{paiseToInr(depositRequiredPaiseForPreview)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-apg-silver">Deposit collected</dt>
              <dd className="text-white">{paiseToInr(depositPaidPaisePreview)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-white/10 pt-2">
              <dt className="text-apg-silver">Remaining balance</dt>
              <dd className="font-semibold text-white">{paiseToInr(Math.max(0, dueNowPaise))}</dd>
            </div>
          </>
        ) : null}
        {payerName.trim() ? (
          <div className="flex justify-between gap-4">
            <dt className="text-apg-silver">Payer</dt>
            <dd className="text-white">{payerName.trim()}</dd>
          </div>
        ) : null}
        {paymentReference.trim() ? (
          <div className="flex justify-between gap-4">
            <dt className="text-apg-silver">Reference</dt>
            <dd className="text-white">{paymentReference.trim()}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 text-xs text-apg-silver">
        Creates booking, bed assignment, rent invoice, and deposit ledger entries — same as normal
        resident onboarding.
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
          {isProcessing
            ? 'Processing…'
            : saleIntent === 'manual_onboarding'
              ? 'Confirm & onboard resident'
              : 'Confirm & create'}
        </button>
      </div>
    </div>
  ) : null;

  const rightPanelScroll = hasIdentity ? (
    <>
      <ExpressBookingReceipt
        residentName={fullName}
        ctx={ctx}
        stayType={stayType}
        quote={quote}
        depositPaidPaise={depositPaidPaisePreview}
        depositRequiredPaise={depositRequiredPaiseForPreview}
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
          paymentReference={paymentReference}
          setPaymentReference={setPaymentReference}
          paymentDate={paymentDate}
          setPaymentDate={setPaymentDate}
          payerName={payerName}
          setPayerName={setPayerName}
          paymentNotes={paymentNotes}
          setPaymentNotes={setPaymentNotes}
          disabled={isProcessing}
        />
      </div>
    </>
  ) : null;

  const rightPanelFooter = hasIdentity ? (
    <>
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
    </>
  ) : null;

  const rightPanelMobile = hasIdentity ? (
    <div className="space-y-4 lg:hidden">
      {rightPanelScroll}
    </div>
  ) : null;

  return (
    <div className="-mx-3 flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0B0F14] sm:-mx-4 lg:-mx-8">
      <header className="shrink-0 border-b border-white/10 bg-[#0B0F14]/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white sm:text-2xl">Sale Express</h1>
            <p className="text-sm text-apg-silver">
              {saleIntentLabel(saleIntent)} · one resident at a time
            </p>
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

      <div className="flex min-h-0 flex-1 overflow-hidden lg:flex-row">
        <div
          data-express-booking-form-scroll
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-6 sm:px-6 lg:px-8"
        >
          {submitError ? (
            <div
              className="mx-auto mb-4 w-full max-w-6xl rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
              role="alert"
            >
              {submitError}
            </div>
          ) : null}
          {!hasIdentity ? (
            <div className="mx-auto w-full max-w-6xl space-y-4">
              <div className={posGlassCard}>
                <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">
                  Workflow
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ['sale', 'Rent & walk-in sale', 'Bill existing or new stays, rent collection'],
                      [
                        'manual_onboarding',
                        'New resident / manual onboarding',
                        'Create resident, bed, rent, custom deposit & payment in one flow',
                      ],
                    ] as const
                  ).map(([value, title, desc]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSaleIntent(value)}
                      className={`rounded-xl border p-4 text-left transition ${
                        saleIntent === value
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
              <ExpressBookingSearchPanel
                variant="hero"
                onSelect={selectResident}
                onCreateNew={beginNewResident}
              />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-6xl">
              <div className="min-w-0">{leftPanel}</div>
              {rightPanelMobile}
            </div>
          )}
        </div>

        {hasIdentity ? (
          <aside
            data-express-booking-preview-panel
            className="hidden min-h-0 w-[22rem] shrink-0 flex-col overflow-hidden border-l border-white/10 bg-[#0B0F14] lg:flex"
          >
            <div
              data-express-booking-preview-scroll
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
            >
              <div className="space-y-4 p-4 sm:p-6">{rightPanelScroll}</div>
            </div>
            <div
              data-express-booking-preview-footer
              className="shrink-0 space-y-4 border-t border-white/10 bg-[#0B0F14] p-4 sm:p-6"
            >
              {rightPanelFooter}
            </div>
          </aside>
        ) : null}
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
  paymentReference,
  setPaymentReference,
  paymentDate,
  setPaymentDate,
  payerName,
  setPayerName,
  paymentNotes,
  setPaymentNotes,
  disabled = false,
}: {
  paymentStatus: ExpressBookingPaymentStatus;
  setPaymentStatus: (v: ExpressBookingPaymentStatus) => void;
  paymentMethod: 'cash' | 'upi' | 'bank_transfer' | 'other';
  setPaymentMethod: (v: 'cash' | 'upi' | 'bank_transfer' | 'other') => void;
  amountReceivedInr: string;
  setAmountReceivedInr: (v: string) => void;
  paymentReference: string;
  setPaymentReference: (v: string) => void;
  paymentDate: string;
  setPaymentDate: (v: string) => void;
  payerName: string;
  setPayerName: (v: string) => void;
  paymentNotes: string;
  setPaymentNotes: (v: string) => void;
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
          <option value="other">Other / external</option>
        </select>
      </label>
      <label className="block text-xs text-apg-silver">
        Payment date
        <input
          type="date"
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
          className={posInputClass}
          disabled={disabled}
        />
      </label>
      <label className="block text-xs text-apg-silver">
        Payment reference
        <input
          value={paymentReference}
          onChange={(e) => setPaymentReference(e.target.value)}
          className={posInputClass}
          placeholder="UTR / receipt no."
          disabled={disabled}
        />
      </label>
      <label className="block text-xs text-apg-silver">
        Payer (optional — e.g. company name)
        <input
          value={payerName}
          onChange={(e) => setPayerName(e.target.value)}
          className={posInputClass}
          disabled={disabled}
        />
      </label>
      <label className="block text-xs text-apg-silver">
        Notes
        <input
          value={paymentNotes}
          onChange={(e) => setPaymentNotes(e.target.value)}
          className={posInputClass}
          disabled={disabled}
        />
      </label>
    </div>
  );
}
