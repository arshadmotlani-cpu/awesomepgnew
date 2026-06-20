'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  expressWalkInSaleAction,
  listExpressWalkInBedsAction,
  lookupExpressWalkInCustomerAction,
  requestRemainingDepositAction,
  type ExpressWalkInBedOption,
  type ExpressWalkInLookupResult,
} from '@/app/(admin)/admin/quick-actions/actions';
import { paiseToInr } from '@/src/lib/format';
import {
  STAY_CHECK_IN_TIME,
  STAY_CHECK_OUT_TIME,
  STAY_TIMING_RULE_COPY,
} from '@/src/lib/residents/stayBillingRules';

function defaultCheckInDate(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-white/10 bg-[#0d1118] px-3 py-2.5 text-sm text-white placeholder:text-apg-muted focus:border-[#FF5A1F]/50 focus:outline-none focus:ring-1 focus:ring-[#FF5A1F]/30';

const sectionClass = 'rounded-2xl border border-white/10 bg-[#12161C]/80 p-4';

function inrToNumber(value: string): number {
  const n = Number.parseFloat(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function buildWhatsAppUrl(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

type FoundResident = ExpressWalkInLookupResult & { found: true };

export function ExpressBookingConsole({ onDone }: { onDone: () => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [lookup, setLookup] = useState<ExpressWalkInLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  const [customerId, setCustomerId] = useState<string | undefined>();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [adminVerifiedKyc, setAdminVerifiedKyc] = useState(true);
  const [isNewResident, setIsNewResident] = useState(true);

  const [checkInDate, setCheckInDate] = useState(defaultCheckInDate());
  const [stayType, setStayType] = useState<'fixed' | 'continue'>('continue');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [blocksWholeRoom, setBlocksWholeRoom] = useState(false);

  const [beds, setBeds] = useState<ExpressWalkInBedOption[]>([]);
  const [bedsLoading, setBedsLoading] = useState(false);
  const [selectedPgId, setSelectedPgId] = useState('');
  const [bedId, setBedId] = useState('');

  const [rentAmountInr, setRentAmountInr] = useState('');
  const [depositRequiredInr, setDepositRequiredInr] = useState('');
  const [depositPaidInr, setDepositPaidInr] = useState('');
  const [rentPaidInr, setRentPaidInr] = useState('');
  const [walletCreditInr, setWalletCreditInr] = useState('');
  const [useWalletCredit, setUseWalletCredit] = useState(false);
  const [walletAvailablePaise, setWalletAvailablePaise] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'bank_transfer' | 'other'>(
    'upi',
  );
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial'>('paid');

  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    message: string;
    href: string;
    bookingCode: string;
    customerId: string;
    bookingId?: string;
  } | null>(null);
  const [depositLinkUrl, setDepositLinkUrl] = useState<string | null>(null);
  const [requestingDeposit, startDepositRequest] = useTransition();

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

  const depositRequired = inrToNumber(depositRequiredInr);
  const depositPaid = inrToNumber(depositPaidInr);
  const rentPaid = inrToNumber(rentPaidInr);
  const rentAmount = inrToNumber(rentAmountInr);
  const pendingDeposit = Math.max(0, depositRequired - depositPaid - (useWalletCredit ? inrToNumber(walletCreditInr) : 0));
  const totalPaid = depositPaid + rentPaid;

  useEffect(() => {
    setBedsLoading(true);
    void listExpressWalkInBedsAction(checkInDate).then((res) => {
      if (res.ok) setBeds(res.beds);
      setBedsLoading(false);
    });
  }, [checkInDate]);

  useEffect(() => {
    if (!selectedBed) return;
    if (!rentAmountInr && selectedBed.monthlyRatePaise > 0) {
      setRentAmountInr(String(selectedBed.monthlyRatePaise / 100));
    }
    if (!depositRequiredInr && selectedBed.depositPaise > 0) {
      setDepositRequiredInr(String(selectedBed.depositPaise / 100));
      if (!depositPaidInr) setDepositPaidInr(String(selectedBed.depositPaise / 100));
    }
  }, [selectedBed, rentAmountInr, depositRequiredInr, depositPaidInr]);

  useEffect(() => {
    if (pendingDeposit > 0) setPaymentStatus('partial');
    else if (depositPaid > 0 || rentPaid > 0) setPaymentStatus('paid');
  }, [pendingDeposit, depositPaid, rentPaid]);

  function resetUser() {
    setLookup(null);
    setCustomerId(undefined);
    setFullName('');
    setPhone('');
    setEmail('');
    setSearchQuery('');
    setIsNewResident(true);
    setWalletAvailablePaise(0);
    setWalletCreditInr('');
    setUseWalletCredit(false);
  }

  function applyFound(data: FoundResident) {
    setCustomerId(data.customerId);
    setFullName(data.fullName);
    setPhone(data.phone);
    setEmail(data.email);
    setGender(data.gender);
    setIsNewResident(false);
    setLookup(data);
    setWalletAvailablePaise(data.walletCreditPaise);
    if (data.walletCreditPaise > 0) {
      setUseWalletCredit(true);
      setWalletCreditInr(String(data.walletCreditPaise / 100));
    }
  }

  function runSearch() {
    setLookupError(null);
    startSearch(async () => {
      const res = await lookupExpressWalkInCustomerAction(searchQuery);
      if ('error' in res) {
        setLookupError(res.error);
        return;
      }
      if (res.found) {
        applyFound(res);
      } else {
        resetUser();
        const digits = searchQuery.replace(/\D/g, '');
        if (digits.length >= 10) setPhone(searchQuery.trim());
        setFullName(searchQuery.trim());
        setIsNewResident(true);
      }
    });
  }

  function submitBooking() {
    setSubmitError(null);
    startSubmit(async () => {
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
        rentAmountInr: rentAmount,
        depositRequiredInr: depositRequired,
        depositPaidInr: depositPaid,
        rentPaidInr: rentPaid,
        walletCreditInr: useWalletCredit ? inrToNumber(walletCreditInr) : 0,
        paymentMethod,
      });
      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }
      setSuccess({
        message: res.message,
        href: res.href ?? `/admin/residents/${res.customerId ?? customerId}`,
        bookingCode: res.href?.split('booking=')[1] ?? '',
        customerId: res.customerId ?? customerId ?? '',
        bookingId: res.bookingId,
      });
    });
  }

  function requestRemainingDeposit() {
    if (!success?.customerId || pendingDeposit <= 0) return;
    startDepositRequest(async () => {
      const res = await requestRemainingDepositAction({
        customerId: success.customerId,
        bookingId: success.bookingId,
        amountInr: pendingDeposit,
      });
      if (res.ok && res.href) setDepositLinkUrl(res.href);
    });
  }

  const invoicePreview = (
    <div className="space-y-3 text-sm">
      <div className="flex justify-between border-b border-white/10 pb-2">
        <span className="text-apg-silver">Stay type</span>
        <span className="font-medium text-white">
          {stayType === 'fixed' ? 'Fixed stay' : 'Continue living'}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-apg-silver">Check-in</span>
        <span className="text-white">
          {checkInDate} · {STAY_CHECK_IN_TIME}
        </span>
      </div>
      {stayType === 'fixed' && checkOutDate ? (
        <div className="flex justify-between">
          <span className="text-apg-silver">Check-out</span>
          <span className="text-white">
            {checkOutDate} · {STAY_CHECK_OUT_TIME}
          </span>
        </div>
      ) : null}
      {selectedBed ? (
        <div className="flex justify-between">
          <span className="text-apg-silver">Bed</span>
          <span className="text-white">{selectedBed.label}</span>
        </div>
      ) : null}
      <div className="flex justify-between pt-2">
        <span className="text-apg-silver">Rent</span>
        <span className="font-medium text-white">₹{rentAmount.toLocaleString('en-IN')}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-apg-silver">Deposit paid</span>
        <span className="font-medium text-white">₹{depositPaid.toLocaleString('en-IN')}</span>
      </div>
      {pendingDeposit > 0 ? (
        <div className="flex justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <span className="text-amber-100">Pending deposit</span>
          <span className="font-semibold text-amber-50">₹{pendingDeposit.toLocaleString('en-IN')}</span>
        </div>
      ) : null}
      {useWalletCredit && inrToNumber(walletCreditInr) > 0 ? (
        <div className="flex justify-between text-apg-silver">
          <span>Wallet credit applied</span>
          <span>₹{inrToNumber(walletCreditInr).toLocaleString('en-IN')}</span>
        </div>
      ) : null}
      <div className="flex justify-between border-t border-white/10 pt-3 text-base font-semibold">
        <span className="text-white">Total paid now</span>
        <span className="text-white">₹{totalPaid.toLocaleString('en-IN')}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-apg-muted">
        Electricity included in rent. AC usage may be charged separately when enabled. Checkout by{' '}
        {STAY_CHECK_OUT_TIME} — staying past that time counts as an extra day.
      </p>
    </div>
  );

  if (success) {
    const waText = [
      `Booking ${success.bookingCode}`,
      fullName,
      stayType === 'fixed' ? `Fixed stay · ${checkInDate} → ${checkOutDate}` : `Continue living from ${checkInDate}`,
      `Rent ₹${rentAmount.toLocaleString('en-IN')}`,
      `Deposit paid ₹${depositPaid.toLocaleString('en-IN')}`,
      pendingDeposit > 0 ? `Pending deposit ₹${pendingDeposit.toLocaleString('en-IN')}` : null,
      `Total paid ₹${totalPaid.toLocaleString('en-IN')}`,
    ]
      .filter(Boolean)
      .join('\n');

    return (
      <div className="space-y-4">
        <div className={sectionClass}>
          <p className="text-sm font-medium text-white">Booking created</p>
          <p className="mt-1 text-xs text-apg-silver">{success.message}</p>
        </div>
        {invoicePreview}
        <div className="flex flex-wrap gap-2">
          <Link href={success.href} className="rounded-xl bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white" onClick={onDone}>
            Open profile
          </Link>
          <a
            href={buildWhatsAppUrl(phone, waText)}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5"
          >
            Send WhatsApp invoice
          </a>
          {pendingDeposit > 0 ? (
            <button
              type="button"
              disabled={requestingDeposit}
              onClick={requestRemainingDeposit}
              className="rounded-xl border border-[#FF5A1F]/40 px-4 py-2.5 text-sm font-medium text-[#FF5A1F] hover:bg-[#FF5A1F]/10 disabled:opacity-50"
            >
              {requestingDeposit ? 'Creating link…' : 'Request remaining deposit'}
            </button>
          ) : null}
        </div>
        {depositLinkUrl ? (
          <p className="text-xs text-apg-silver">
            Payment link:{' '}
            <a href={depositLinkUrl} className="text-[#FF5A1F] underline" target="_blank" rel="noreferrer">
              Share with resident
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  const hasIdentity = fullName.trim() && phone.trim();

  return (
    <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
      {/* Search */}
      {!hasIdentity ? (
        <div className={sectionClass}>
          <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Find resident</p>
          <p className="mt-1 text-xs text-apg-silver">Phone or name — existing profiles open pre-filled.</p>
          <div className="mt-3 flex gap-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="+91… or full name"
              className={inputClass}
              autoFocus
            />
            <button
              type="button"
              disabled={searchQuery.trim().length < 3 || searching}
              onClick={runSearch}
              className="shrink-0 rounded-xl bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {searching ? '…' : 'Search'}
            </button>
          </div>
          {lookupError ? <p className="mt-2 text-xs text-rose-300">{lookupError}</p> : null}
        </div>
      ) : null}

      {/* Identity header */}
      {hasIdentity ? (
        <div className={`${sectionClass} flex flex-wrap items-start justify-between gap-3`}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-apg-muted">
              {isNewResident ? 'New resident' : 'Existing resident'}
            </p>
            <p className="mt-1 text-lg font-semibold text-white">{fullName}</p>
            <p className="text-sm text-apg-silver">{phone}</p>
            {selectedBed ? (
              <p className="mt-2 text-xs text-apg-silver">
                Bed · <span className="text-white">{selectedBed.label}</span>
              </p>
            ) : (
              <p className="mt-2 text-xs text-amber-200/90">No bed assigned yet</p>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={resetUser} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-apg-silver hover:text-white">
              Change user
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('express-bed-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/5"
            >
              Assign bed
            </button>
          </div>
        </div>
      ) : null}

      {hasIdentity ? (
        <>
          {/* Resident details (new only) */}
          {isNewResident ? (
            <div className={sectionClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Resident details</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-apg-silver">
                  Full name
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
                </label>
                <label className="block text-xs text-apg-silver">
                  Phone
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
                </label>
                <label className="block text-xs text-apg-silver sm:col-span-2">
                  Email (optional)
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                </label>
                <label className="block text-xs text-apg-silver">
                  Gender
                  <select value={gender} onChange={(e) => setGender(e.target.value as typeof gender)} className={inputClass}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>
              <label className="mt-3 flex items-start gap-2 text-xs text-apg-silver">
                <input type="checkbox" checked={adminVerifiedKyc} onChange={(e) => setAdminVerifiedKyc(e.target.checked)} className="mt-0.5" />
                Verified by admin (skip OTP)
              </label>
            </div>
          ) : null}

          {/* Stay mode */}
          <div className={sectionClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Booking mode</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setStayType('fixed')}
                className={`rounded-xl border p-4 text-left transition ${
                  stayType === 'fixed'
                    ? 'border-[#FF5A1F]/50 bg-[#FF5A1F]/10'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <p className="font-semibold text-white">Fixed stay</p>
                <p className="mt-1 text-xs text-apg-silver">Check-in and check-out required · short stays</p>
              </button>
              <button
                type="button"
                onClick={() => setStayType('continue')}
                className={`rounded-xl border p-4 text-left transition ${
                  stayType === 'continue'
                    ? 'border-[#FF5A1F]/50 bg-[#FF5A1F]/10'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <p className="font-semibold text-white">Continue living</p>
                <p className="mt-1 text-xs text-apg-silver">Monthly recurring · no checkout date</p>
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-apg-silver">
                Check-in · {STAY_CHECK_IN_TIME}
                <input type="date" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} className={inputClass} />
              </label>
              {stayType === 'fixed' ? (
                <label className="block text-xs text-apg-silver">
                  Check-out · {STAY_CHECK_OUT_TIME}
                  <input type="date" value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} className={inputClass} required />
                </label>
              ) : null}
            </div>
            <p className="mt-3 text-[11px] text-apg-muted">{STAY_TIMING_RULE_COPY}</p>
          </div>

          {/* Bed */}
          <div id="express-bed-section" className={sectionClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Assign bed</p>
            {bedsLoading ? <p className="mt-2 text-xs text-apg-silver">Loading available beds…</p> : null}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-apg-silver">
                Property
                <select value={selectedPgId} onChange={(e) => { setSelectedPgId(e.target.value); setBedId(''); }} className={inputClass}>
                  <option value="">All properties</option>
                  {pgOptions.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-apg-silver">
                Bed
                <select value={bedId} onChange={(e) => setBedId(e.target.value)} className={inputClass} required>
                  <option value="">Select bed…</option>
                  {filteredBeds.map((b) => (
                    <option key={b.bedId} value={b.bedId}>{b.label}</option>
                  ))}
                </select>
              </label>
            </div>
            {selectedBed && selectedBed.depositPaise > 0 ? (
              <p className="mt-2 text-xs text-apg-silver">
                Suggested deposit for this bed · {paiseToInr(selectedBed.depositPaise)}
              </p>
            ) : null}
            <label className="mt-3 flex items-center gap-2 text-xs text-apg-silver">
              <input type="checkbox" checked={blocksWholeRoom} onChange={(e) => setBlocksWholeRoom(e.target.checked)} />
              Single occupancy — block whole room on calendar
            </label>
          </div>

          {/* Pricing */}
          <div className={sectionClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Pricing</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-apg-silver">
                Rent amount (₹)
                <input value={rentAmountInr} onChange={(e) => setRentAmountInr(e.target.value)} className={inputClass} inputMode="decimal" />
              </label>
              <label className="block text-xs text-apg-silver">
                Deposit required (₹)
                <input value={depositRequiredInr} onChange={(e) => setDepositRequiredInr(e.target.value)} className={inputClass} inputMode="decimal" />
              </label>
              <label className="block text-xs text-apg-silver">
                Deposit paid now (₹)
                <input value={depositPaidInr} onChange={(e) => setDepositPaidInr(e.target.value)} className={inputClass} inputMode="decimal" />
              </label>
              <label className="block text-xs text-apg-silver">
                Rent paid now (₹)
                <input value={rentPaidInr} onChange={(e) => setRentPaidInr(e.target.value)} className={inputClass} inputMode="decimal" />
              </label>
            </div>
            {pendingDeposit > 0 ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm">
                <span className="text-apg-silver">Pending deposit balance · </span>
                <span className="font-semibold text-white">₹{pendingDeposit.toLocaleString('en-IN')}</span>
                <span className="mt-1 block text-[11px] text-apg-muted">Not a deduction — remaining amount to collect after booking.</span>
              </div>
            ) : null}
            {walletAvailablePaise > 0 ? (
              <div className="mt-3 rounded-xl border border-white/10 px-3 py-2.5">
                <p className="text-xs text-apg-silver">Wallet balance · {paiseToInr(walletAvailablePaise)}</p>
                <label className="mt-2 flex items-center gap-2 text-xs text-apg-silver">
                  <input type="checkbox" checked={useWalletCredit} onChange={(e) => setUseWalletCredit(e.target.checked)} />
                  Apply wallet credit to deposit
                </label>
                {useWalletCredit ? (
                  <input value={walletCreditInr} onChange={(e) => setWalletCreditInr(e.target.value)} className={`${inputClass} mt-2`} inputMode="decimal" />
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Invoice preview */}
          <div className={sectionClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Invoice preview</p>
            <div className="mt-3">{invoicePreview}</div>
          </div>

          {/* Payment & submit */}
          <div className={sectionClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Payment</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-apg-silver">
                Method
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className={inputClass}>
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block text-xs text-apg-silver">
                Status
                <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as typeof paymentStatus)} className={inputClass}>
                  <option value="paid">Paid in full</option>
                  <option value="partial">Partial (deposit pending)</option>
                </select>
              </label>
            </div>
            {submitError ? <p className="mt-3 text-xs text-rose-300">{submitError}</p> : null}
            <button
              type="button"
              disabled={submitting || !bedId || (stayType === 'fixed' && !checkOutDate)}
              onClick={submitBooking}
              className="mt-4 w-full rounded-xl bg-[#FF5A1F] py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
            >
              {submitting ? 'Creating booking…' : 'Create booking & generate invoice'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
