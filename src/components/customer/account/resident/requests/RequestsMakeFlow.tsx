'use client';

import { useState } from 'react';
import { ConfirmationGate } from '@/src/components/customer/design-system';
import { ApgCard } from '@/src/components/customer/design-system';
import { siteWhatsAppUrl } from '@/src/lib/siteContact';
import { getCategoryById, type RequestCategoryId } from '@/src/lib/residents/requestCenter';
import { RequestSuccessState } from '@/src/components/customer/account/resident/requests/RequestSuccessState';
import { residentTabHref } from '@/src/lib/accountNavigation';
import { primaryBtn } from '@/src/lib/design-system/tokens';

type Step = 'form' | 'confirm' | 'success';

type Props = {
  bookingId: string;
  roomLabel: string;
  onClose: () => void;
  initialCategory: RequestCategoryId;
};

export function RequestsMakeFlow({
  roomLabel,
  onClose,
  initialCategory,
}: Props) {
  const [step, setStep] = useState<Step>('form');
  const [details, setDetails] = useState('');

  const category = getCategoryById(initialCategory);
  if (!category || category.wired !== 'whatsapp') {
    return null;
  }

  if (step === 'success') {
    return (
      <RequestSuccessState
        title="Request sent"
        statusLabel="Sent on WhatsApp"
        nextStep="Send the WhatsApp message to finish. Our team usually replies within a few hours."
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

  if (step === 'confirm') {
    return (
      <ConfirmationGate
        title="Submit this request?"
        message={category.confirmSentence({ roomLabel })}
        confirmLabel="Open WhatsApp"
        cancelLabel="Go back"
        onConfirm={() => {
          if (category.whatsappMessage) {
            window.open(
              siteWhatsAppUrl(category.whatsappMessage(details)),
              '_blank',
              'noopener,noreferrer',
            );
          }
          setStep('success');
        }}
        onCancel={() => setStep('form')}
      />
    );
  }

  return (
    <ApgCard tier="resident" className="space-y-4">
      <button type="button" onClick={onClose} className="text-xs text-apg-silver hover:text-white">
        ← Back
      </button>
      <h3 className="text-base font-semibold text-white">{category.title}</h3>
      <p className="text-sm text-apg-silver">{category.description}</p>
      <label className="block text-sm">
        <span className="font-medium text-white">Tell us what you need</span>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          placeholder="Keep it short — one or two sentences is enough."
          className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-apg-silver/60"
        />
      </label>
      <button type="button" onClick={() => setStep('confirm')} className={`${primaryBtn} w-full`}>
        Continue
      </button>
    </ApgCard>
  );
}
