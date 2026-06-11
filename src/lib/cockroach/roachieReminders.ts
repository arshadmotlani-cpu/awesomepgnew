export type RoachieReminderKind = 'pre-book' | 'reserve';

export const ROACHIE_REMINDER_EVENT = 'roachie:reminder';

export const REMINDER_COPY: Record<RoachieReminderKind, string> = {
  'pre-book':
    'Pre-Book saves a future bed for you. Pick your move-in date when the bed opens up — no need to keep checking every day.',
  reserve:
    'Reserve Bed holds your spot before move-in at about half rate. Full rent starts on your actual move-in day.',
};

export function dispatchRoachieReminder(kind: RoachieReminderKind): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(ROACHIE_REMINDER_EVENT, { detail: { kind } }),
  );
}
