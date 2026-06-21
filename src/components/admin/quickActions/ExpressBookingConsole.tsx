'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  expressWalkInSaleAction,
  getExpressWalkInCustomerAction,
  listExpressWalkInBedsAction,
  requestRemainingDepositAction,
  searchExpressWalkInCustomersAction,
  type ExpressWalkInBedOption,
  type ExpressWalkInLookupResult,
  type ExpressWalkInSearchHit,
} from '@/app/(admin)/admin/quick-actions/actions';
import { paiseToInr } from '@/src/lib/format';
import { diffDays } from '@/src/lib/dates';
import {
  STAY_CHECK_IN_TIME,
  STAY_CHECK_OUT_TIME,
  STAY_TIMING_RULE_COPY,
  formatStayDateTime,
} from '@/src/lib/residents/stayBillingRules';
import { buildExpressWalkInWhatsAppUrl } from '@/src/lib/billing/expressWalkInWhatsApp';

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

function computeFixedStayRentInr(
  checkInDate: string,
  checkOutDate: string,
  dailyRatePaise: number,
): number | null {
  if (!checkInDate || !checkOutDate || dailyRatePaise <= 0) return null;
  const days = diffDays(checkInDate, checkOutDate);
  if (days <= 0) return null;
  return (days * dailyRatePaise) / 100;
}

function computeFixedStayDays(checkInDate: string, checkOutDate: string): number {
  if (!checkInDate || !checkOutDate) return 0;
  return Math.max(0, diffDays(checkInDate, checkOutDate));
}

function buildWhatsAppUrl(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

type FoundResident = ExpressWalkInLookupResult & { found: true };

export function ExpressBookingConsole({ onDone }: { onDone: () => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ExpressWalkInSearchHit[]>([]);
  const [searchCompleted, setSearchCompleted] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [loadingCustomer, startLoadCustomer] = useTransition();

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
  const [rentManuallyEdited, setRentManuallyEdited] = useState(false);
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [success, setSuccess] = useState<{
    message: string;
    href: string;
    bookingCode: string;
    customerId: string;
    bookingId?: string;
    whatsAppUrl?: string | null;
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

  const fixedStayDays =
    stayType === 'fixed' ? computeFixedStayDays(checkInDate, checkOutDate) : 0;
  const fixedDailyRateInr =
    fixedStayDays > 0 && rentAmount > 0
      ? rentAmount / fixedStayDays
      : selectedBed && selectedBed.dailyRatePaise > 0
        ? selectedBed.dailyRatePaise / 100
        : 0;

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
    if (!depositRequiredInr && selectedBed.depositPaise > 0) {
      setDepositRequiredInr(String(selectedBed.depositPaise / 100));
      if (!depositPaidInr) setDepositPaidInr(String(selectedBed.depositPaise / 100));
    }
  }, [selectedBed, depositRequiredInr, depositPaidInr]);

  useEffect(() => {
    if (rentManuallyEdited || !selectedBed) return;
    if (stayType === 'continue') {
      if (selectedBed.monthlyRatePaise > 0) {
        setRentAmountInr(String(selectedBed.monthlyRatePaise / 100));
      }
      return;
    }
    if (stayType === 'fixed' && checkOutDate) {
      const total = computeFixedStayRentInr(
        checkInDate,
        checkOutDate,
        selectedBed.dailyRatePaise,
      );
      if (total != null) {
        setRentAmountInr(String(total));
      }
    }
  }, [selectedBed, stayType, checkInDate, checkOutDate, rentManuallyEdited]);

  useEffect(() => {
    if (pendingDeposit > 0) setPaymentStatus('partial');
    else if (depositPaid > 0 || rentPaid > 0) setPaymentStatus('paid');
  }, [pendingDeposit, depositPaid, rentPaid]);

  useEffect(() => {
    if (paymentStatus === 'paid' && rentAmount > 0) {
      setRentPaidInr((prev) => {
        if (prev.trim()) return prev;
        return rentAmountInr;
      });
    }
  }, [paymentStatus, rentAmount, rentAmountInr]);

  function resetUser() {
    setCustomerId(undefined);
    setFullName('');
    setPhone('');
    setEmail('');
    setSearchQuery('');
    setSearchResults([]);
    setSearchCompleted(false);
    setIsNewResident(true);
    setWalletAvailablePaise(0);
    setWalletCreditInr('');
    setUseWalletCredit(false);
    setRentAmountInr('');
    setRentManuallyEdited(false);
  }

  function applyFound(data: FoundResident) {
    setCustomerId(data.customerId);
    setFullName(data.fullName);
    setPhone(data.phone);
    setEmail(data.email);
    setGender(data.gender);
    setIsNewResident(false);
    setSearchResults([]);
    setSearchCompleted(false);
    setWalletAvailablePaise(data.walletCreditPaise);
    if (data.walletCreditPaise > 0) {
      setUseWalletCredit(true);
      setWalletCreditInr(String(data.walletCreditPaise / 100));
    }
  }

  function runSearch() {
    setLookupError(null);
    setSearchResults([]);
    setSearchCompleted(false);
    startSearch(async () => {
      const res = await searchExpressWalkInCustomersAction(searchQuery);
      if ('error' in res) {
        setLookupError(res.error);
        return;
      }
      setSearchResults(res.results);
      setSearchCompleted(true);
    });
  }

  function selectExistingResident(hit: ExpressWalkInSearchHit) {
    setLookupError(null);
    startLoadCustomer(async () => {
      const res = await getExpressWalkInCustomerAction(hit.customerId);
      if ('error' in res) {
        setLookupError(res.error);
        return;
      }
      if (res.found) {
        applyFound(res);
      } else {
        setLookupError('Resident not found.');
      }
    });
  }

  function createNewResidentFromSearch() {
    const trimmed = searchQuery.trim();
    setCustomerId(undefined);
    setEmail('');
    setSearchResults([]);
    setSearchCompleted(false);
    setWalletAvailablePaise(0);
    setWalletCreditInr('');
    setUseWalletCredit(false);
    setRentAmountInr('');
    setRentManuallyEdited(false);
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 10) setPhone(trimmed);
    else setPhone('');
    setFullName(trimmed);
    setIsNewResident(true);
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
        setConfirmOpen(false);
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
              rentAmountPaise: Math.round(rentAmount * 100),
              depositRequiredPaise: Math.round(depositRequired * 100),
              depositPaidPaise: res.depositRecordedPaise ?? Math.round(depositPaid * 100),
              rentPaidPaise: res.rentRecordedPaise ?? Math.round(rentPaid * 100),
              balanceDuePaise: res.balanceDuePaise ?? Math.round(pendingDeposit * 100),
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
        customerId: res.customerId ?? customerId ?? '',
        bookingId: res.bookingId,
        whatsAppUrl,
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
        <span className="text-apg-silver">Resident</span>
        <span className="font-medium text-white">{fullName || '—'}</span>
      </div>
      <div className="flex justify-between border-b border-white/10 pb-2">
        <span className="text-apg-silver">Stay type</span>
        <span className="font-medium text-white">
          {stayType === 'fixed' ? 'Fixed stay' : 'Continue living'}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-apg-silver">Check-in</span>
        <span className="text-white">{formatStayDateTime(checkInDate, 'check-in')}</span>
      </div>
      {stayType === 'fixed' && checkOutDate ? (
        <div className="flex justify-between">
          <span className="text-apg-silver">Checkout</span>
          <span className="text-white">{formatStayDateTime(checkOutDate, 'check-out')}</span>
        </div>
      ) : null}
      {stayType === 'fixed' && fixedStayDays > 0 ? (
        <>
          <div className="flex justify-between">
            <span className="text-apg-silver">Days</span>
            <span className="text-white">{fixedStayDays}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-apg-silver">Daily rate</span>
            <span className="text-white">₹{fixedDailyRateInr.toLocaleString('en-IN')}</span>
          </div>
        </>
      ) : null}
      {selectedBed ? (
        <div className="flex justify-between">
          <span className="text-apg-silver">Bed</span>
          <span className="text-white">{selectedBed.label}</span>
        </div>
      ) : null}
      <div className="flex justify-between pt-2">
        <span className="text-apg-silver">
          {stayType === 'fixed' ? 'Total rent' : 'Rent'}
        </span>
        <span className="font-medium text-white">₹{rentAmount.toLocaleString('en-IN')}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-apg-silver">Deposit paid</span>
        <span className="font-medium text-white">₹{depositPaid.toLocaleString('en-IN')}</span>
      </div>
      {pendingDeposit > 0 ? (
        <div className="flex justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <span className="text-amber-100">Balance due</span>
          <span className="font-semibold text-amber-50">₹{pendingDeposit.toLocaleString('en-IN')}</span>
        </div>
      ) : (
        <div className="flex justify-between">
          <span className="text-apg-silver">Balance due</span>
          <span className="text-white">₹0</span>
        </div>
      )}
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
    return (
      <div className="space-y-4">
        <div className={sectionClass}>
          <p className="text-sm font-medium text-white">Booking created</p>
          <p className="mt-1 text-xs text-apg-silver">{success.message}</p>
          <p className="mt-1 text-xs text-apg-silver">Booking code · {success.bookingCode}</p>
        </div>
        {invoicePreview}
        <div className="flex flex-wrap gap-2">
          <Link href={success.href} className="rounded-xl bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white" onClick={onDone}>
            Open profile
          </Link>
          {success.whatsAppUrl ? (
            <a
              href={success.whatsAppUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 hover:bg-emerald-500/20"
            >
              Share on WhatsApp
            </a>
          ) : (
            <a
              href={buildWhatsAppUrl(phone, `Booking ${success.bookingCode} confirmed.`)}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5"
            >
              Share on WhatsApp
            </a>
          )}
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
          <p className="mt-1 text-xs text-apg-silver">Search by phone or name — pick a result to continue.</p>
          <div className="mt-3 flex gap-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchResults([]);
                setSearchCompleted(false);
              }}
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
          {searchResults.length > 0 ? (
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/10">
              {searchResults.map((hit) => (
                <li key={hit.customerId}>
                  <button
                    type="button"
                    disabled={loadingCustomer}
                    onClick={() => selectExistingResident(hit)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-white/5 disabled:opacity-50"
                  >
                    <span>
                      <span className="font-medium text-white">{hit.fullName}</span>
                      <span className="mt-0.5 block text-xs text-apg-silver">{hit.phone}</span>
                    </span>
                    <span className="shrink-0 text-xs text-apg-muted">{hit.statusLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {searchCompleted && searchResults.length === 0 ? (
            <button
              type="button"
              onClick={createNewResidentFromSearch}
              className="mt-3 w-full rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-left text-sm text-apg-silver hover:border-white/25 hover:text-white"
            >
              Create new resident with “{searchQuery.trim()}”
            </button>
          ) : null}
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
                onClick={() => {
                  setStayType('fixed');
                  setRentManuallyEdited(false);
                }}
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
                onClick={() => {
                  setStayType('continue');
                  setRentManuallyEdited(false);
                }}
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
                <select value={bedId} onChange={(e) => { setRentManuallyEdited(false); setBedId(e.target.value); }} className={inputClass} required>
                  <option value="">Select bed…</option>
                  {filteredBeds.map((b) => (
                    <option key={b.bedId} value={b.bedId}>{b.label}</option>
                  ))}
                </select>
              </label>
            </div>
            {selectedBed && stayType === 'fixed' && selectedBed.dailyRatePaise > 0 ? (
              <p className="mt-2 text-xs text-apg-silver">
                Daily rate · {paiseToInr(selectedBed.dailyRatePaise)}
                {fixedStayDays > 0
                  ? ` · ${fixedStayDays} days = ₹${rentAmount.toLocaleString('en-IN')}`
                  : null}
              </p>
            ) : null}
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
                <input
                  value={rentAmountInr}
                  onChange={(e) => {
                    setRentManuallyEdited(true);
                    setRentAmountInr(e.target.value);
                  }}
                  className={inputClass}
                  inputMode="decimal"
                />
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
            {confirmOpen ? (
              <div className="mt-4 space-y-3 rounded-xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/5 p-4">
                <p className="text-sm font-medium text-white">Confirm invoice creation</p>
                <p className="text-xs text-apg-silver">
                  Review the summary above. If anything fails, the system rolls back — no partial booking or bed assignment.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={submitBooking}
                    className="flex-1 rounded-xl bg-[#FF5A1F] py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
                  >
                    {submitting ? 'Creating…' : 'Confirm & create invoice'}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setConfirmOpen(false)}
                    className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-apg-silver hover:text-white"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={submitting || !bedId || (stayType === 'fixed' && !checkOutDate)}
                onClick={() => setConfirmOpen(true)}
                className="mt-4 w-full rounded-xl bg-[#FF5A1F] py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
              >
                Review & create invoice
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
