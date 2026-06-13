import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';

export type BedAssignmentWhatsAppInput = {
  customerName: string;
  phone: string;
  pgName: string;
  roomNumber?: string;
  bedCode?: string;
};

export function buildBedAssignmentWhatsAppMessage(input: BedAssignmentWhatsAppInput): string {
  const firstName = input.customerName.trim().split(/\s+/)[0] || 'there';
  const location =
    input.roomNumber && input.bedCode
      ? ` · Room ${input.roomNumber} · ${input.bedCode}`
      : input.bedCode
        ? ` · ${input.bedCode}`
        : '';
  return (
    `Hi ${firstName}, your bed has been assigned in ${input.pgName}${location}. ` +
    `Welcome! Log in to your resident dashboard for rent, electricity, and KYC.`
  );
}

export function buildBedAssignmentWhatsAppUrl(input: BedAssignmentWhatsAppInput): string | null {
  const digits = whatsAppPhoneDigits(input.phone);
  if (!digits) return null;
  const text = buildBedAssignmentWhatsAppMessage(input);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
