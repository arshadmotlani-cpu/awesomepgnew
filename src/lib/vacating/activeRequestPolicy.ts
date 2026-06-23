/** Vacating rows in these statuses block a new submit for the same booking. */
export const ACTIVE_VACATING_STATUSES = ['pending', 'approved'] as const;

export type ActiveVacatingStatus = (typeof ACTIVE_VACATING_STATUSES)[number];

export function vacatingStatusBlocksNewSubmit(status: string): boolean {
  return (ACTIVE_VACATING_STATUSES as readonly string[]).includes(status);
}
