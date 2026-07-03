import { paiseToInr } from '@/src/lib/format';
import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';

export const PAYMENT_PROOF_REJECTION_REASON_CODES = [
  'incorrect_screenshot',
  'not_clear',
  'wrong_amount',
  'not_received',
  'wrong_bill',
  'duplicate',
  'already_processed',
  'other',
] as const;

export type PaymentProofRejectionReasonCode = (typeof PAYMENT_PROOF_REJECTION_REASON_CODES)[number];

export type PaymentProofRejectionReasonOption = {
  code: PaymentProofRejectionReasonCode;
  label: string;
  messageTemplate: string;
};

export const PAYMENT_PROOF_REJECTION_REASONS: PaymentProofRejectionReasonOption[] = [
  {
    code: 'incorrect_screenshot',
    label: 'Incorrect screenshot',
    messageTemplate:
      'We could not verify your payment because the uploaded screenshot does not match the payment.\n\nPlease upload the correct payment screenshot for verification.\n\nOnce uploaded, we will review it as soon as possible.\n\nThank you.',
  },
  {
    code: 'not_clear',
    label: 'Screenshot not clear',
    messageTemplate:
      'The payment screenshot you uploaded is not clear enough for us to verify.\n\nPlease upload a clearer screenshot showing the full transaction details.\n\nOnce uploaded, we will review it as soon as possible.\n\nThank you.',
  },
  {
    code: 'wrong_amount',
    label: 'Wrong payment amount',
    messageTemplate:
      'The amount in your payment screenshot does not match the bill amount.\n\nPlease pay the correct amount and upload a new screenshot for verification.\n\nThank you.',
  },
  {
    code: 'not_received',
    label: 'Payment not received',
    messageTemplate:
      'We have not received this payment in our account yet.\n\nIf you have already paid, please upload a screenshot showing the successful transaction.\n\nOtherwise, please complete the payment and upload proof.\n\nThank you.',
  },
  {
    code: 'wrong_bill',
    label: 'Wrong bill selected',
    messageTemplate:
      'The payment screenshot appears to be for a different bill.\n\nPlease upload the correct screenshot for this bill.\n\nThank you.',
  },
  {
    code: 'duplicate',
    label: 'Duplicate upload',
    messageTemplate:
      'This payment screenshot has already been submitted or processed.\n\nIf you need to pay again, please upload a new screenshot for the latest payment.\n\nThank you.',
  },
  {
    code: 'already_processed',
    label: 'Already processed',
    messageTemplate:
      'This payment has already been processed.\n\nNo further action is needed unless you believe this is an error. Please contact the PG office if you need help.\n\nThank you.',
  },
  {
    code: 'other',
    label: 'Other',
    messageTemplate:
      'We could not approve your payment screenshot.\n\nPlease upload a new screenshot for verification.\n\nThank you.',
  },
];

export function rejectionReasonLabel(code: PaymentProofRejectionReasonCode): string {
  return PAYMENT_PROOF_REJECTION_REASONS.find((r) => r.code === code)?.label ?? code;
}

export function buildResidentRejectionMessage(input: {
  reasonCode: PaymentProofRejectionReasonCode;
  reasonDetail?: string;
  residentName: string;
  billLabel: string;
  amountPaise?: number;
}): string {
  const reason = PAYMENT_PROOF_REJECTION_REASONS.find((r) => r.code === input.reasonCode);
  const firstName = input.residentName.trim().split(/\s+/)[0] || 'there';
  const amountLine =
    input.amountPaise != null && input.amountPaise > 0
      ? `Bill: ${input.billLabel} — ${paiseToInr(input.amountPaise)}\n\n`
      : `Bill: ${input.billLabel}\n\n`;

  let body = reason?.messageTemplate ?? PAYMENT_PROOF_REJECTION_REASONS[0]!.messageTemplate;
  if (input.reasonCode === 'other' && input.reasonDetail?.trim()) {
    body = `${input.reasonDetail.trim()}\n\nPlease upload a new screenshot for verification.\n\nThank you.`;
  }

  return `Hi ${firstName},\n\n${amountLine}${body}`;
}

export function buildPaymentRejectionWhatsAppUrl(input: {
  phone: string | null | undefined;
  message: string;
}): string | null {
  const digits = input.phone ? whatsAppPhoneDigits(input.phone) : null;
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(input.message)}`;
}

export function validateRejectionInput(input: {
  reasonCode: string;
  reasonDetail?: string;
  residentMessage: string;
}): { ok: true } | { ok: false; message: string } {
  if (!PAYMENT_PROOF_REJECTION_REASON_CODES.includes(input.reasonCode as PaymentProofRejectionReasonCode)) {
    return { ok: false, message: 'Select a rejection reason.' };
  }
  if (input.reasonCode === 'other' && !input.reasonDetail?.trim()) {
    return { ok: false, message: 'Please describe the reason when selecting Other.' };
  }
  if (!input.residentMessage.trim()) {
    return { ok: false, message: 'Resident message is required.' };
  }
  return { ok: true };
}
