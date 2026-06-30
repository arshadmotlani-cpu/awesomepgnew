import { logger } from '@/src/lib/logger';
import {
  loadResidentAccountContext,
  type ResidentAccountContext,
} from '@/src/services/residentAccountContext';

export type ResidentAccountContextLoadResult =
  | { ok: true; ctx: ResidentAccountContext }
  | { ok: false; reason: 'not_found' | 'load_failed'; errorMessage?: string };

/**
 * Loads resident account context with step logging.
 * Never throws — returns a structured result for post-login routes.
 */
export async function loadResidentAccountContextSafe(
  customerId: string,
  email?: string | null,
): Promise<ResidentAccountContextLoadResult> {
  logger.info('post-login resident context load start', { customerId, email });

  try {
    const ctx = await loadResidentAccountContext(customerId);
    if (!ctx) {
      logger.warn('post-login resident context missing customer', { customerId, email });
      return { ok: false, reason: 'not_found' };
    }

    logger.info('post-login resident context load ok', {
      customerId,
      email,
      hasConfirmedBooking: ctx.hasConfirmedBooking,
      isActiveStay: ctx.isActiveStay,
      primaryBookingId: ctx.primaryBooking?.bookingId ?? null,
      primaryCheckInDate: ctx.primaryBooking?.checkInDate ?? null,
      invoiceCount: ctx.invoices.length,
    });

    return { ok: true, ctx };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('post-login resident context load failed', {
      customerId,
      email,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return { ok: false, reason: 'load_failed', errorMessage };
  }
}
