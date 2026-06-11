import { PS4_ADDON_LABEL, PS4_PLANS } from '@/src/lib/playstation/plans';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';

export type ResidentBriefingInput = {
  residentName: string;
  pgName: string;
  bookingCode: string;
  bookingId?: string;
  roomLabel: string;
  bedLabel: string;
  checkInDate: string;
  checkoutLabel: string;
  statusLabel: string;
  paymentLabel: string;
  monthlyRentLabel?: string;
  kycLabel?: string;
  isActiveResident: boolean;
  ps4Active?: boolean;
  ps4PlanLabel?: string;
  vacatingDate?: string;
  vacatingStatus?: string;
};

import { COCKROACH_AI_NAME } from '@/src/lib/cockroach/branding';

/** One Cockroach message: booking summary + PS4 add-on + vacating with date picker. */
export function buildResidentBriefingMessage(input: ResidentBriefingInput): string {
  const lines: string[] = [];

  lines.push(`Hey ${input.residentName}! I'm ${COCKROACH_AI_NAME} — here's your full stay guide for ${input.pgName}.`);

  lines.push('');
  lines.push('YOUR BOOKING');
  lines.push(`• Code: ${input.bookingCode}`);
  lines.push(`• ${input.roomLabel} · ${input.bedLabel}`);
  lines.push(`• Check-in: ${input.checkInDate} · Checkout: ${input.checkoutLabel}`);
  lines.push(`• Status: ${input.statusLabel} · Payment: ${input.paymentLabel}`);
  if (input.monthlyRentLabel) {
    lines.push(`• Monthly rent: ${input.monthlyRentLabel}`);
  }
  if (input.kycLabel) {
    lines.push(`• KYC: ${input.kycLabel}`);
  }

  if (input.isActiveResident) {
    lines.push('');
    lines.push('RESIDENT DASHBOARD');
    lines.push('Open Resident in the top menu (or /account/resident) for rent invoices, electricity split, deposit balance, and payment history.');

    lines.push('');
    lines.push('ADD PS4 GAMING LOUNGE');
    if (input.ps4Active && input.ps4PlanLabel) {
      lines.push(`You're already on the PS4 add-on (${input.ps4PlanLabel}). Renew or upgrade under My services on the resident dashboard.`);
    } else {
      lines.push(`1. Go to Resident dashboard → My services → "${PS4_ADDON_LABEL}".`);
      lines.push('2. Tap Subscribe to PS4 add-on.');
      lines.push(
        `3. Pick a plan: Weekly ${formatInr(PS4_PLANS.weekly.pricePaise)}, Bi-weekly ${formatInr(PS4_PLANS.biweekly.pricePaise)}, or Monthly ${formatInr(PS4_PLANS.monthly.pricePaise)} — billed separately from rent.`,
      );
      lines.push('4. Scan the UPI QR and upload payment proof to activate lounge access.');
    }

    lines.push('');
    lines.push('GIVE MOVE-OUT NOTICE (PICK YOUR DATE)');
    if (input.vacatingDate && input.vacatingStatus) {
      lines.push(
        `You already submitted vacating for ${input.vacatingDate} (${input.vacatingStatus}). Admin sees it instantly — no need to call or WhatsApp.`,
      );
    } else {
      const vacatingPath = input.bookingId
        ? `/account/resident/request-vacating/${input.bookingId}`
        : '/account/resident';
      lines.push(`1. Open Resident dashboard → your ${input.pgName} card → Vacating → Submit vacating request.`);
      lines.push(`   (Direct link: ${vacatingPath})`);
      lines.push('2. Choose your vacating date in the calendar — the website saves it automatically when you submit.');
      lines.push(
        `3. Give at least ${VACATING_NOTICE_MIN_DAYS} days notice to protect your full deposit; shorter notice triggers a fixed 5-day rent deduction.`,
      );
    }
  } else {
    lines.push('');
    lines.push('NEXT STEPS');
    lines.push('Complete payment and KYC from this booking page. Once you are checked in as a monthly resident, PS4 add-ons and online vacating notice unlock on the Resident dashboard.');
  }

  lines.push('');
  lines.push("Tap Got it when you're done — I'm always in the corner if you need me again.");

  return lines.join('\n');
}

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
