import type { MascotPose } from './mascotAssets';

export type OnboardingSubStep = {
  /** `data-roachie-tour` value; null = mascot-only (no spotlight). */
  target: string | null;
  message: string;
  durationMs: number;
};

export type OnboardingStep = {
  id: string;
  pose: MascotPose;
  /** Total step budget — sub-steps may be shorter; user can tap Next early. */
  durationMs: number;
  subSteps: OnboardingSubStep[];
  /** Extra copy when the tour target is missing from the page. */
  fallbackNote?: string;
};

/** Example dates for kid-friendly copy (stable across renders). */
export const TOUR_EXAMPLE_DATES = {
  leavingSoon: '15 August',
  availableUntil: '30 August',
  reserveFrom: '1 August',
  moveIn: '20 August',
} as const;

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'support',
    pose: 'welcome',
    durationMs: 5000,
    subSteps: [
      {
        target: 'support',
        message:
          'Need help with payment, booking, or anything confusing? Tap Support anytime — a real person on WhatsApp will guide you.',
        durationMs: 5000,
      },
    ],
  },
  {
    id: 'room-and-bed',
    pose: 'welcome',
    durationMs: 6000,
    subSteps: [
      {
        target: 'room',
        message:
          'You do not book a whole room first. Awesome PG works bed-by-bed — each spot is its own booking.',
        durationMs: 3000,
      },
      {
        target: 'bed-grid',
        message:
          'Pick the exact bed you want in this room. Your bed code is what goes on your booking — not just "Room 3".',
        durationMs: 3000,
      },
    ],
  },
  {
    id: 'bed-available',
    pose: 'welcome',
    durationMs: 5000,
    subSteps: [
      {
        target: 'bed-available',
        message:
          'This bed is available right now. You can move in as soon as your dates and payment are confirmed.',
        durationMs: 5000,
      },
    ],
    fallbackNote:
      'Look for a green "Available now" badge on any free bed — that means you can book it for today.',
  },
  {
    id: 'bed-notice',
    pose: 'warning',
    durationMs: 7000,
    subSteps: [
      {
        target: 'bed-notice',
        message: `See the "Leaving Soon" badge? Someone is moving out around ${TOUR_EXAMPLE_DATES.leavingSoon}. You can secure this bed before someone else books it.`,
        durationMs: 7000,
      },
    ],
    fallbackNote: `When a guest gives notice to leave, the bed shows "Leaving Soon" with a date like ${TOUR_EXAMPLE_DATES.leavingSoon}. You can book it for after they move out.`,
  },
  {
    id: 'pre-book',
    pose: 'welcome',
    durationMs: 8000,
    subSteps: [
      {
        target: 'pre-book',
        message:
          'Pre-Book is for beds that open up on a future date. You claim your spot early — no need to keep checking back every day.',
        durationMs: 8000,
      },
    ],
    fallbackNote:
      'Use Pre-Book when a bed says "From [date]" — you are reserving your place before it becomes free.',
  },
  {
    id: 'reserve',
    pose: 'warning',
    durationMs: 12000,
    subSteps: [
      {
        target: 'reserve',
        message:
          'Reserve Bed holds your bed before move-in day. It is not the same as paying full rent yet — think of it as saving your spot.',
        durationMs: 4000,
      },
      {
        target: 'reserve',
        message:
          'While you are in the reservation period, you pay about half the normal rate. Full monthly rent starts on your actual move-in date.',
        durationMs: 4000,
      },
      {
        target: 'reserve',
        message: `Example: Reserve from ${TOUR_EXAMPLE_DATES.reserveFrom}, move in ${TOUR_EXAMPLE_DATES.moveIn}. You pay the lower reservation rate until move-in, then regular rent begins.`,
        durationMs: 4000,
      },
    ],
    fallbackNote: `Reserve Bed saves your bed before move-in (e.g. reserve ${TOUR_EXAMPLE_DATES.reserveFrom}, move in ${TOUR_EXAMPLE_DATES.moveIn}) at about half rate until then.`,
  },
  {
    id: 'bed-capped',
    pose: 'warning',
    durationMs: 8000,
    subSteps: [
      {
        target: 'bed-capped',
        message: `This bed is free for your dates but only until ${TOUR_EXAMPLE_DATES.availableUntil} — another guest already booked it after that.`,
        durationMs: 8000,
      },
    ],
    fallbackNote: `Some beds show "Available until: ${TOUR_EXAMPLE_DATES.availableUntil}" when a future booking caps how long you can stay.`,
  },
  {
    id: 'extend',
    pose: 'welcome',
    durationMs: 8000,
    subSteps: [
      {
        target: 'extend',
        message:
          'Already living here? Extend Stay lets you stay longer. We check if anyone else booked your bed after your current plan — so you never get bumped.',
        durationMs: 8000,
      },
    ],
    fallbackNote:
      'After you move in, use Extend Stay from your booking page if you want more time — we always check for future bookings first.',
  },
  {
    id: 'payment',
    pose: 'success',
    durationMs: 6000,
    subSteps: [
      {
        target: 'payment',
        message:
          'Before payment you will see a clear breakdown: booking or reservation charges, refundable deposit, and total due now. No surprises at checkout.',
        durationMs: 6000,
      },
    ],
    fallbackNote:
      'Your summary shows Booking/Reservation fees, Deposit, and Total due now — always review it before paying.',
  },
  {
    id: 'ps4-addon',
    pose: 'welcome',
    durationMs: 7000,
    subSteps: [
      {
        target: 'ps4-addon',
        message:
          'Optional add-ons include PS4 gaming maintenance — a separate service from your bed rent. Weekly ₹350, bi-weekly ₹550, or monthly ₹750.',
        durationMs: 7000,
      },
    ],
    fallbackNote:
      'Look for Optional add-ons at checkout if you want shared PS4 lounge access — billed separately from rent and deposit.',
  },
  {
    id: 'done',
    pose: 'success',
    durationMs: 0,
    subSteps: [
      {
        target: null,
        message: "That's all! You're ready to pick a bed and book. I'll pop back quietly if you need me — tap Support anytime.",
        durationMs: 0,
      },
    ],
  },
];

export function tourTargetSelector(key: string): string {
  return `[data-roachie-tour="${key}"]`;
}
