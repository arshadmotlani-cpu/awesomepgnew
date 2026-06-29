'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmationGate } from '@/src/components/customer/design-system';
import { siteWhatsAppUrl } from '@/src/lib/siteContact';
import {
  getCategoryById,
  type RequestCategoryId,
} from '@/src/lib/residents/requestCenter';
import { RequestSuccessState } from '@/src/components/customer/account/resident/requests/RequestSuccessState';
import { DepositRefundRequestFlow } from '@/src/components/customer/account/resident/requests/DepositRefundRequestFlow';
import { DepositExtensionRequestFlow } from '@/src/components/customer/account/resident/requests/DepositExtensionRequestFlow';
import { residentTabHref } from '@/src/lib/accountNavigation';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import { getDepositRefundEligibility } from '@/src/lib/vacating/depositRefundEligibility';

type Step = 'select' | 'form' | 'confirm' | 'success';

type Props = {
  bookingId: string;
  roomLabel: string;
  refundableBalancePaise: number;
  hasDepositDue: boolean;
  onClose: () => void;
  initialCategory?: RequestCategoryId | null;
  vacating: VacatingForBookingRow | null;
  bookingStatus?: string;
  durationMode?: string;
  expectedCheckoutDate?: string | null;
  bookingCreatedAt?: Date;
  checkoutSettlement?: { status: string; rejectionReason?: string | null } | null;
  monthlyRentPaise?: number;
};

export function RequestsMakeFlow({
  bookingId,
  roomLabel,
  refundableBalancePaise,
  hasDepositDue,
  onClose,
  initialCategory = null,
  vacating,
  bookingStatus = 'confirmed',
  durationMode = 'monthly',
  expectedCheckoutDate = null,
  bookingCreatedAt,
  checkoutSettlement = null,
  monthlyRentPaise = 0,
}: Props) {
  const router = useRouter();
  const refundEligibility = getDepositRefundEligibility({
    vacating,
    booking: bookingCreatedAt
      ? {
          status: bookingStatus,
          durationMode,
          expectedCheckoutDate,
          createdAt: bookingCreatedAt,
        }
      : null,
    settlement: checkoutSettlement,
    monthlyRentPaise,
  });
  const [step, setStep] = useState<Step>(
    initialCategory &&
      getCategoryById(initialCategory)?.wired !== 'deposit_refund' &&
      getCategoryById(initialCategory)?.wired !== 'deposit_extension'
      ? 'form'
      : 'select',
  );
  const [categoryId, setCategoryId] = useState<RequestCategoryId | null>(initialCategory);
  const [details, setDetails] = useState('');

  const category = categoryId ? getCategoryById(categoryId) : null;

  if (category?.wired === 'deposit_refund') {
    if (!refundEligibility.canRequestRefund) {
      return (
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-900">Deposit refund locked</p>
          <p className="text-sm text-zinc-600">{refundEligibility.lockReason}</p>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-indigo-600">
            ← Back
          </button>
        </div>
      );
    }
    return (
      <DepositRefundRequestFlow
        bookingId={bookingId}
        refundableBalancePaise={refundableBalancePaise}
        estimatedDeductionPaise={vacating?.deductionPaise ?? 0}
        onDone={onClose}
        onBack={onClose}
      />
    );
  }

  if (category?.wired === 'deposit_extension') {
    return (
      <DepositExtensionRequestFlow
        bookingId={bookingId}
        onDone={onClose}
        onBack={() => setCategoryId(null)}
      />
    );
  }

  if (category?.wired === 'vacating' && step === 'form') {
    router.push(`/account/resident/request-vacating/${bookingId}`);
    return (
      <p className="text-sm text-zinc-600">Opening move-out form…</p>
    );
  }

  if (step === 'success' && category) {
    return (
      <RequestSuccessState
        title="Request sent"
        requestId={category.wired === 'whatsapp' ? undefined : undefined}
        statusLabel={category.wired === 'whatsapp' ? 'Sent on WhatsApp' : 'Submitted'}
        nextStep={
          category.wired === 'whatsapp'
            ? 'Send the WhatsApp message to finish. Our team usually replies within a few hours.'
            : 'We will update your requests list when the status changes.'
        }
        primaryHref={residentTabHref('requests')}
        primaryLabel="Back to requests"
        whatsappHref={
          category.whatsappMessage
            ? siteWhatsAppUrl(category.whatsappMessage(details))
            : undefined
        }
      />
    );
  }

  if (step === 'confirm' && category) {
    return (
      <ConfirmationGate
        title="Submit this request?"
        message={category.confirmSentence({ roomLabel })}
        confirmLabel="Submit request"
        cancelLabel="Go back"
        onConfirm={() => {
          if (category.wired === 'whatsapp' && category.whatsappMessage) {
            window.open(siteWhatsAppUrl(category.whatsappMessage(details)), '_blank', 'noopener,noreferrer');
          }
          setStep('success');
        }}
        onCancel={() => setStep('form')}
      />
    );
  }

  if (step === 'form' && category) {
    return (
      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        <button type="button" onClick={() => setStep('select')} className="text-xs text-zinc-500 hover:text-zinc-800">
          ← Choose another type
        </button>
        <h3 className="text-base font-semibold text-zinc-900">{category.title}</h3>
        <p className="text-sm text-zinc-600">{category.description}</p>
        <label className="block text-sm">
          <span className="font-medium text-zinc-800">Tell us what you need</span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            placeholder="Keep it short — one or two sentences is enough."
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <button
          type="button"
          onClick={() => setStep('confirm')}
          className="flex w-full min-h-[48px] items-center justify-center rounded-xl bg-[#FF5A1F] text-sm font-semibold text-white hover:brightness-110"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-zinc-900">What do you need?</h3>
        <button type="button" onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-800">
          Cancel
        </button>
      </div>
      <p className="text-sm text-zinc-600">Pick one — each request has its own simple flow.</p>
      <ul className="space-y-2">
        {(
          [
            'maintenance',
            'room_change',
            'complaint',
            'vacating',
            ...(hasDepositDue ? (['deposit_extension'] as const) : []),
            'deposit_refund',
            'bed_change',
            'visitor',
          ] as RequestCategoryId[]
        ).map((id) => {
          const cat = getCategoryById(id);
          if (!cat) return null;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => {
                  setCategoryId(id);
                  if (cat.wired === 'vacating') {
                    router.push(`/account/resident/request-vacating/${bookingId}`);
                    return;
                  }
                  if (cat.wired === 'deposit_refund' || cat.wired === 'deposit_extension') {
                    setStep('form');
                    return;
                  }
                  setStep('form');
                }}
                className="w-full rounded-lg border border-zinc-200 px-4 py-3 text-left hover:border-[#FF5A1F]/40 hover:bg-zinc-50"
              >
                <span className="text-sm font-medium text-zinc-900">{cat.title}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">{cat.description}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
