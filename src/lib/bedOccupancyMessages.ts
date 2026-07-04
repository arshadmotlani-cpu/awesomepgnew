/** Client-safe bed status copy — no database imports. */

export const BED_OCCUPIED_MESSAGE = 'This bed currently has an active resident.';
export const BED_MAINTENANCE_MARKED_MESSAGE = 'Bed marked under maintenance.';
export const BED_STATUS_SAVE_ERROR =
  'Could not update bed status. Please try again in a moment.';

/** Never surface raw SQL / Drizzle query text in bed-status UI. */
export function sanitizeBedStatusError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (
    message === BED_OCCUPIED_MESSAGE ||
    message === BED_MAINTENANCE_MARKED_MESSAGE ||
    message.startsWith('Bed has confirmed booking') ||
    message.startsWith('Bed has unpaid checkout') ||
    message.startsWith('Cannot remove this bed') ||
    message.startsWith('Cannot remove this room')
  ) {
    return message;
  }

  if (/Failed query:/i.test(message) || /syntax error at or near/i.test(message)) {
    if (/bed_reservations|bookings/i.test(message)) {
      return BED_STATUS_SAVE_ERROR;
    }
    return BED_STATUS_SAVE_ERROR;
  }

  return message;
}
