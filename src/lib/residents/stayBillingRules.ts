/** Fixed PG billing cycle — shown wherever stay timing affects charges. */
export const STAY_CHECK_IN_TIME = '11:00 AM';
export const STAY_CHECK_OUT_TIME = '11:00 AM';
export const STAY_CYCLE_HOURS = 24;

export const STAY_TIMING_RULE_COPY =
  `Check-in: ${STAY_CHECK_IN_TIME}. Check-out: ${STAY_CHECK_OUT_TIME} next day. ` +
  'Even if you arrive late at night (e.g. 1 AM), billing is counted from the previous 11:00 AM cycle.';

export const SHORT_STAY_RULE_COPY =
  'Short stays are charged per full cycle — 1 cycle = 24 hours (11 AM → 11 AM).';

export const PREBOOKING_RULE_COPY =
  'Selected dates are reserved temporarily. The room is blocked only for those dates and becomes unavailable afterward.';

export const DEPOSIT_REFUND_RULE_COPY =
  'If historical room electricity bills exist, we use the average of recent cycles. If no data is available, a conservative default average is used. Remaining deposit is refunded after deductions.';

export function formatStayDateTime(dateYmd: string, kind: 'check-in' | 'check-out'): string {
  const label = kind === 'check-in' ? STAY_CHECK_IN_TIME : STAY_CHECK_OUT_TIME;
  const d = new Date(`${dateYmd}T12:00:00`);
  const formatted = d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${formatted}, ${label}`;
}
