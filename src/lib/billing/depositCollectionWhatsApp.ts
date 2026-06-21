import { paiseToInr } from '@/src/lib/format';
import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';

export type DepositCollectionWhatsAppInput = {
  residentName: string;
  phone: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  depositDuePaise: number;
  paymentLinkUrl?: string;
};

export function buildDepositCollectionWhatsAppMessage(
  input: Omit<DepositCollectionWhatsAppInput, 'phone'>,
): string {
  const firstName = input.residentName.trim().split(/\s+/)[0] || 'there';
  const amountDue = paiseToInr(input.depositDuePaise);
  const lines = [
    `Hi ${firstName},`,
    '',
    'Security deposit reminder:',
    '',
    `PG: ${input.pgName}`,
    `Room: ${input.roomNumber}`,
    `Bed: ${input.bedCode}`,
    `Deposit due: ${amountDue}`,
    '',
  ];

  if (input.paymentLinkUrl) {
    lines.push(
      'Pay using this secure link (UPI / QR):',
      input.paymentLinkUrl,
      '',
      'Open the link on your phone, scan the QR code, or pay via UPI.',
    );
  } else {
    lines.push(
      'Please pay via UPI or contact the office for payment instructions.',
    );
  }

  lines.push('', 'Thank you.');
  return lines.join('\n');
}

export function buildDepositCollectionWhatsAppUrl(
  input: DepositCollectionWhatsAppInput,
): string | null {
  const digits = whatsAppPhoneDigits(input.phone);
  if (!digits) return null;
  const text = buildDepositCollectionWhatsAppMessage(input);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
