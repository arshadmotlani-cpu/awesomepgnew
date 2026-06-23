'use client';

import { useActionState, useCallback, useState } from 'react';
import {
  IndianPhoneInput,
  indianPhoneDefaultLocal,
} from '@/src/components/customer/IndianPhoneInput';
import { CouponCodeField } from '@/src/components/customer/CouponCodeField';
import { PricingBreakdown } from '@/src/components/customer/PricingBreakdown';
import { Ps4AddonSelector, ps4AddonPaise } from '@/src/components/customer/Ps4AddonSelector';
import { paiseToInr } from '@/src/lib/format';
import type { LineItem } from '@/src/services/pricing';
import {
  checkoutTotalWithOneMonthDeposit,
  oneMonthDepositPaise,
} from '@/src/lib/billing/partialDepositCheckout';
import { PS4_ADDON_LABEL, PS4_PLANS, type Ps4PlanId } from '@/src/lib/playstation/plans';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/lib/dateDefaults';
import { stayTypeFromPricingMode } from '@/src/lib/stayType';
import { formatDate } from '@/src/lib/format';
import { BOOK_BED_ACTION, HOLD_THIS_BED } from '@/src/lib/booking/bookingFunnelLabels';
import type { BookingActionState } from '@/app/(customer)/booking/new/actions';
import { createBookingAction } from '@/app/(customer)/booking/new/actions';

export type CartLineItem = {
  bedId: string;
  label: string;
  lineTotalPaise: number;
  unitsLabel: string;
};

type Props = {
  bedIds: string[];
  startDate: string;
  endDate: string | null;
  durationMode: 'daily' | 'weekly' | 'monthly' | 'open_ended' | 'fixed_stay';
  lineItems: CartLineItem[];
  subtotalPaise: number;
  depositPaise: number;
  depositCreditAppliedPaise?: number;
  additionalDepositDuePaise?: number;
  totalPaise: number;
  notes?: string;
  /** Rent line items for transparent breakdown (excludes deposit lines). */
  breakdownLineItems?: LineItem[];
  lowestPriceApplied?: boolean;
  /** Pre-filled from the signed-in customer session (Phase 6). */
  defaultCustomer?: {
    fullName: string;
    email: string;
    phone: string;
  };
  /** Show optional PS4 gaming maintenance add-on during checkout. */
  showPs4Addon?: boolean;
  /** Whether check-in is today/soon (direct book) or a future date (pre-book). */
  checkoutTiming?: 'available_now' | 'future_start';
  /** Simplified checkout — hides duplicate pricing and jargon. */
  simpleCheckout?: boolean;
};

const INITIAL_STATE: BookingActionState = { status: 'idle' };

export function BookingCartForm({
  bedIds,
  startDate,
  endDate,
  durationMode,
  lineItems,
  subtotalPaise,
  depositPaise,
  depositCreditAppliedPaise = 0,
  additionalDepositDuePaise,
  totalPaise,
  defaultCustomer,
  showPs4Addon = false,
  checkoutTiming = 'available_now',
  breakdownLineItems = [],
  lowestPriceApplied,
  simpleCheckout = false,
}: Props) {
  const [state, formAction, isPending] = useActionState(
    createBookingAction,
    INITIAL_STATE,
  );

  const [ps4Plan, setPs4Plan] = useState<Ps4PlanId | null>(null);
  const [couponDiscountPaise, setCouponDiscountPaise] = useState(0);
  const onCouponDiscountChange = useCallback((discount: number) => {
    setCouponDiscountPaise(discount);
  }, []);
  const ps4Paise = ps4AddonPaise(ps4Plan);
  const bookingTotalPaise = totalPaise - couponDiscountPaise;
  const depositDueNowPaise =
    additionalDepositDuePaise ?? Math.max(0, depositPaise - depositCreditAppliedPaise);

  const conflictBedIds = new Set(
    state.status === 'error' ? state.conflictBedIds ?? [] : [],
  );

  const [phoneLocal, setPhoneLocal] = useState(() =>
    indianPhoneDefaultLocal(defaultCustomer?.phone),
  );
  const [payOneMonthDeposit, setPayOneMonthDeposit] = useState(false);
  const phoneLocked = Boolean(defaultCustomer?.phone);

  const oneMonthDeposit =
    depositCreditAppliedPaise === 0 ? oneMonthDepositPaise(depositPaise, subtotalPaise) : null;
  const checkoutTotalPaise =
    payOneMonthDeposit && oneMonthDeposit != null
      ? checkoutTotalWithOneMonthDeposit(bookingTotalPaise + ps4Paise, depositPaise, oneMonthDeposit)
      : bookingTotalPaise + ps4Paise;

  const isPreBook = checkoutTiming === 'future_start';
  const submitLabel = isPreBook ? `${HOLD_THIS_BED} & continue to payment` : `${BOOK_BED_ACTION} & continue to payment`;
  const pendingLabel = isPreBook ? 'Holding your bed…' : 'Booking your bed…';
  const stepHint = isPreBook
    ? `You're holding this bed for check-in on ${formatDate(startDate)}. Next: pay via UPI QR and upload proof — admin confirms once verified.`
    : 'This bed is available now. Next: pay rent + deposit via UPI QR and upload proof for admin approval.';

  if (simpleCheckout) {
    return (
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="startDate" value={startDate} />
        {endDate ? <input type="hidden" name="endDate" value={endDate} /> : null}
        <input type="hidden" name="durationMode" value={durationMode} />
        <input type="hidden" name="stayType" value={stayTypeFromPricingMode(durationMode)} />
        {bedIds.map((id) => (
          <input key={id} type="hidden" name="bedId" value={id} />
        ))}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Your name"
            name="fullName"
            required
            autoComplete="name"
            defaultValue={defaultCustomer?.fullName}
          />
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Phone
            <IndianPhoneInput
              value={phoneLocal}
              onChange={setPhoneLocal}
              name="phone"
              required
              readOnly={phoneLocked}
            />
          </label>
          <Field
            label="Email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={defaultCustomer?.email}
          />
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Gender
            <select
              name="gender"
              required
              defaultValue=""
              className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900"
            >
              <option value="" disabled>
                Pick one
              </option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        {state.status === 'error' ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {state.message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-apg-orange text-base font-bold text-white hover:brightness-110 disabled:opacity-40"
        >
          {isPending ? 'Please wait…' : 'Continue to Pay'}
        </button>
      </form>
    );
  }

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]"
    >
      {/* Hidden state — preserved across re-renders */}
      <input type="hidden" name="startDate" value={startDate} />
      {endDate ? <input type="hidden" name="endDate" value={endDate} /> : null}
      <input type="hidden" name="durationMode" value={durationMode} />
      {bedIds.map((id) => (
        <input key={id} type="hidden" name="bedId" value={id} />
      ))}

      {/* Customer details */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">Your details</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Details are tied to your signed-in account. You&apos;ll continue to
          payment after confirming.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            name="fullName"
            required
            autoComplete="name"
            defaultValue={defaultCustomer?.fullName}
          />
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Mobile number
            <IndianPhoneInput
              value={phoneLocal}
              onChange={setPhoneLocal}
              name="phone"
              required
              readOnly={phoneLocked}
            />
          </label>
          <Field
            label="Email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={defaultCustomer?.email}
          />
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Gender
            <select
              name="gender"
              required
              defaultValue=""
              className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="" disabled>
                Select…
              </option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-1 text-xs font-medium text-zinc-700">
          Notes for the operator <span className="text-zinc-400">(optional)</span>
          <textarea
            name="notes"
            rows={3}
            placeholder="e.g. arriving late evening, need help with luggage"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 placeholder:opacity-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>

        {showPs4Addon ? (
          <div className="mt-6">
            <Ps4AddonSelector
              selectedPlan={ps4Plan}
              onChange={setPs4Plan}
              disabled={isPending}
            />
            <input type="hidden" name="ps4Plan" value={ps4Plan ?? ''} />
          </div>
        ) : null}

        {state.status === 'error' ? (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <strong className="font-semibold">Couldn&apos;t create the booking.</strong>
            <p className="mt-1">{state.message}</p>
            {conflictBedIds.size > 0 ? (
              <p className="mt-2 text-xs text-rose-600">
                Conflicting bed IDs:{' '}
                <code className="rounded bg-rose-100 px-1">
                  {Array.from(conflictBedIds).join(', ')}
                </code>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Cart summary */}
      <aside className="self-start rounded-xl border border-zinc-200 bg-white p-5 shadow-sm" data-roachie-focus="confirm-booking">
        <h2 className="text-base font-semibold text-zinc-900">Your stay</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row term="Check-in" value={startDate} />
          <Row
            term="Check-out"
            value={
              endDate
                ? endDate
                : `Flexible — ${VACATING_NOTICE_MIN_DAYS} days notice to leave`
            }
          />
          <Row
            term="Stay type"
            value={
              durationMode === 'open_ended'
                ? 'Live without checkout (monthly billing)'
                : durationMode === 'fixed_stay'
                  ? 'Fixed stay (auto week + day pricing)'
                  : durationMode.replace('_', ' ')
            }
          />
          <Row term="Beds" value={String(bedIds.length)} />
        </dl>

        {durationMode === 'open_ended' ? (
          <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
            You pay the first month now. After move-in, rent is billed monthly from your resident
            dashboard. When you plan to leave, submit a vacating request at least{' '}
            {VACATING_NOTICE_MIN_DAYS} days before your last day.
          </p>
        ) : null}

        <hr className="my-4 border-zinc-200" />

        {breakdownLineItems.length > 0 ? (
          <PricingBreakdown
            rentLineItems={breakdownLineItems}
            rentSubtotalPaise={subtotalPaise}
            depositPaise={depositPaise}
            ps4Paise={ps4Paise}
            couponDiscountPaise={couponDiscountPaise}
            grandTotalPaise={checkoutTotalPaise}
            lowestPriceApplied={lowestPriceApplied}
            durationMode={durationMode}
            compact
          />
        ) : (
          <ul className="space-y-2 text-sm">
            {lineItems.map((item) => (
              <li
                key={item.bedId}
                className="flex items-start justify-between gap-3"
              >
                <span>
                  <span className="block font-medium text-zinc-900">
                    {item.label}
                  </span>
                  <span className="text-xs text-zinc-500">{item.unitsLabel}</span>
                </span>
                <span className="font-semibold text-zinc-900">
                  {paiseToInr(item.lineTotalPaise)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <hr className="my-4 border-zinc-200" />

        <CouponCodeField subtotalPaise={subtotalPaise} onDiscountChange={onCouponDiscountChange} />

        <dl className="mt-4 space-y-1.5 text-sm">
          <Row term="Subtotal" value={paiseToInr(subtotalPaise)} />
          {couponDiscountPaise > 0 ? (
            <Row term="Promo discount" value={`−${paiseToInr(couponDiscountPaise)}`} />
          ) : null}
          <Row term="Refundable deposit" value={paiseToInr(depositPaise)} />
          {oneMonthDeposit != null ? (
            <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <input
                type="checkbox"
                checked={payOneMonthDeposit}
                onChange={(e) => setPayOneMonthDeposit(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Pay one month&apos;s deposit now ({paiseToInr(oneMonthDeposit)}) — remaining{' '}
                {paiseToInr(depositPaise - oneMonthDeposit)} due next month
              </span>
            </label>
          ) : null}
          {depositCreditAppliedPaise > 0 ? (
            <>
              <Row
                term="Deposit credit used"
                value={`−${paiseToInr(depositCreditAppliedPaise)}`}
              />
              <Row
                term="Additional deposit due"
                value={paiseToInr(depositDueNowPaise)}
              />
            </>
          ) : null}
          {ps4Paise > 0 && ps4Plan ? (
            <Row
              term={PS4_PLANS[ps4Plan].label + ' · ' + PS4_ADDON_LABEL}
              value={paiseToInr(ps4Paise)}
            />
          ) : null}
        </dl>

        <div className="apg-checkout-total mt-3 flex items-center justify-between rounded-md px-3 py-2.5">
          <span className="text-sm font-medium">Total due now</span>
          <span className="apg-checkout-total-amount text-base font-semibold">
            {paiseToInr(checkoutTotalPaise)}
          </span>
        </div>
        {depositCreditAppliedPaise > 0 ? (
          <p className="mt-2 text-[11px] text-emerald-700">
            {paiseToInr(depositCreditAppliedPaise)} from your deposit wallet is applied toward
            this booking&apos;s security deposit.
          </p>
        ) : null}
        {ps4Paise > 0 ? (
          <p className="mt-2 text-[11px] text-zinc-500">
            Includes {paiseToInr(bookingTotalPaise)} for bed/deposit plus {paiseToInr(ps4Paise)} PS4
            add-on (separate service line).
          </p>
        ) : null}

        <p className="mt-3 rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900">
          {stepHint}
        </p>

        <button
          type="submit"
          disabled={isPending}
          className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {isPending ? pendingLabel : submitLabel}
        </button>
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          Your bed is held briefly while you complete payment.
        </p>
      </aside>
    </form>
  );
}

function Field({
  label,
  name,
  type = 'text',
  required,
  autoComplete,
  pattern,
  defaultValue,
  readOnly,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  pattern?: string;
  defaultValue?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        pattern={pattern}
        defaultValue={defaultValue}
        readOnly={readOnly}
        className={`h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500${readOnly ? ' bg-zinc-50 text-zinc-600' : ''}`}
      />
    </label>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-zinc-500">{term}</dt>
      <dd className="text-zinc-900">{value}</dd>
    </div>
  );
}
