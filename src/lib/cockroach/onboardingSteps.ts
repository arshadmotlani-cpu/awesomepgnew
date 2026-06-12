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
    durationMs: 4000,
    subSteps: [
      {
        target: 'support',
        message: 'Stuck on payment or booking? Tap Support — WhatsApp help from a real person.',
        durationMs: 4000,
      },
    ],
  },
  {
    id: 'pg-bed-map',
    pose: 'welcome',
    durationMs: 5000,
    subSteps: [
      {
        target: 'bed-map',
        message:
          'This is the live bed map. Each tile is one bed — tap it for rent, dates, and to book.',
        durationMs: 5000,
      },
    ],
    fallbackNote: 'Scroll to Rooms & beds — each coloured tile is one bookable bed.',
  },
  {
    id: 'room-and-bed',
    pose: 'welcome',
    durationMs: 5000,
    subSteps: [
      {
        target: 'bed-grid',
        message:
          'Pick the exact bed you want. Green = available, grey = occupied, orange = someone leaving soon.',
        durationMs: 5000,
      },
    ],
  },
  {
    id: 'bed-notice',
    pose: 'warning',
    durationMs: 6000,
    subSteps: [
      {
        target: 'bed-notice',
        message:
          'Orange = notice period. Tap the bed — Cockroach explains pre-book (check in when it opens) vs reserve (hold now, move in when you reach Nagpur).',
        durationMs: 6000,
      },
    ],
    fallbackNote: 'Notice beds — tap for rent and Cockroach’s pre-book vs reserve guide.',
  },
  {
    id: 'payment',
    pose: 'success',
    durationMs: 4000,
    subSteps: [
      {
        target: 'payment',
        message: 'Before you pay you will see rent, deposit, and total — no surprises at checkout.',
        durationMs: 4000,
      },
    ],
  },
  {
    id: 'done',
    pose: 'success',
    durationMs: 0,
    subSteps: [
      {
        target: null,
        message: "That's the essentials. Tap any bed to book — I'll stay quiet unless you need Support.",
        durationMs: 0,
      },
    ],
  },
];

export function tourTargetSelector(key: string): string {
  return `[data-roachie-tour="${key}"]`;
}
