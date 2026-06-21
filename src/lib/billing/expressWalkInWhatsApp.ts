import { paiseToInr } from '@/src/lib/format';
import { diffDays } from '@/src/lib/dates';
import { formatStayDateTime } from '@/src/lib/residents/stayBillingRules';
import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';

export type ExpressWalkInWhatsAppInput = {
  residentName: string;
  phone: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  checkInDate: string;
  checkOutDate?: string | null;
  stayType: 'fixed' | 'continue';
  bookingCode: string;
  rentAmountPaise: number;
  depositRequiredPaise: number;
  depositPaidPaise: number;
  rentPaidPaise: number;
  balanceDuePaise: number;
  paymentMethod: string;
  bookingStatus: string;
  rentInvoiceNumber?: string | null;
};

export function buildExpressWalkInWhatsAppMessage(input: ExpressWalkInWhatsAppInput): string {
  const stayDuration =
    input.stayType === 'fixed' && input.checkOutDate
      ? `${diffDays(input.checkInDate, input.checkOutDate)} day${diffDays(input.checkInDate, input.checkOutDate) === 1 ? '' : 's'}`
      : 'Continue living (monthly)';

  const lines = [
    `Hi ${input.residentName.trim().split(/\s+/)[0] || 'there'},`,
    '',
    'Your booking invoice summary:',
    '',
    `Resident: ${input.residentName}`,
    `Mobile: ${input.phone}`,
    `PG: ${input.pgName}`,
    `Room: ${input.roomNumber}`,
    `Bed: ${input.bedCode}`,
    '',
    `Check-in: ${formatStayDateTime(input.checkInDate, 'check-in')}`,
  ];

  if (input.stayType === 'fixed' && input.checkOutDate) {
    lines.push(`Checkout: ${formatStayDateTime(input.checkOutDate, 'check-out')}`);
  }

  lines.push(
    `Stay duration: ${stayDuration}`,
    '',
    `Booking: ${input.bookingCode}`,
  );

  if (input.rentInvoiceNumber) {
    lines.push(`Invoice: ${input.rentInvoiceNumber}`);
  }

  lines.push(
    `Rent amount: ${paiseToInr(input.rentAmountPaise)}`,
    `Deposit amount: ${paiseToInr(input.depositRequiredPaise)}`,
    `Advance paid: ${paiseToInr(input.depositPaidPaise + input.rentPaidPaise)}`,
    `Balance due: ${paiseToInr(input.balanceDuePaise)}`,
    `Payment mode: ${input.paymentMethod.replace('_', ' ')}`,
    `Booking status: ${input.bookingStatus}`,
    '',
    'Thank you for choosing us.',
  );

  return lines.join('\n');
}

export function buildExpressWalkInWhatsAppUrl(input: ExpressWalkInWhatsAppInput): string | null {
  const digits = whatsAppPhoneDigits(input.phone);
  if (!digits) return null;
  const text = buildExpressWalkInWhatsAppMessage(input);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
