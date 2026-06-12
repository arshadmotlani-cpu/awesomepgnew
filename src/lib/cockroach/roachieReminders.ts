export type RoachieReminderKind = 'pre-book' | 'reserve';

export const ROACHIE_REMINDER_EVENT = 'roachie:reminder';

export const REMINDER_COPY: Record<RoachieReminderKind, string> = {
  'pre-book':
    'Pre-book = you check in on the date the bed opens (e.g. when the current guest leaves). Pick that move-in date at checkout.',
  reserve:
    'Reserve = you are not moving in on the open date. Pay ~50% rent now to hold the bed; when you reach Nagpur you choose your actual check-in day.',
};

export function dispatchRoachieReminder(kind: RoachieReminderKind): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(ROACHIE_REMINDER_EVENT, { detail: { kind } }),
  );
}
