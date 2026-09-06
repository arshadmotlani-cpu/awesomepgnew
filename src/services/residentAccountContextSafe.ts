import { logger } from '@/src/lib/logger';
import { hasResidentPortalReadyStay } from '@/src/lib/residents/residentPortalStay';
import { logPortalLoaderFailure } from '@/src/lib/residents/residentPortalLoaderSafety';
import {
  loadResidentAccountContext,
  type ResidentAccountContext,
} from '@/src/services/residentAccountContext';
import { getCustomerById } from '@/src/services/profile';
import { customerHasResidentPortalAccess } from '@/src/lib/residents/residentPortalAccess';

export type ResidentAccountContextLoadResult =
  | { ok: true; ctx: ResidentAccountContext }
  | {
      ok: false;
      reason: 'not_found' | 'incomplete' | 'core_error';
      errorMessage?: string;
    };

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

    const portalReady = hasResidentPortalReadyStay(ctx);
    if (ctx.hasResidentPortalAccess && !portalReady) {
      logger.info('post-login resident context incomplete stay', {
        customerId,
        email,
        hasResidentPortalAccess: ctx.hasResidentPortalAccess,
        primaryBookingId: ctx.primaryBooking?.bookingId ?? null,
      });
      return { ok: false, reason: 'incomplete' };
    }

    logger.info('post-login resident context load ok', {
      customerId,
      email,
      hasConfirmedBooking: ctx.hasConfirmedBooking,
      isActiveStay: ctx.isActiveStay,
      primaryBookingId: ctx.primaryBooking?.bookingId ?? null,
      primaryCheckInDate: ctx.primaryBooking?.checkInDate ?? null,
      invoiceCount: ctx.invoices.length,
      financialSummaryLoaded: ctx.financialSummary != null,
      optionalDegraded: ctx.portalOptionalDegraded,
    });

    return { ok: true, ctx };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logPortalLoaderFailure({
      section: 'core_context',
      customerId,
      loader: 'loadResidentAccountContext',
      required: true,
      error,
    });
    logger.error('post-login resident context load failed', {
      customerId,
      email,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    const customer = await getCustomerById(customerId).catch(() => null);
    const hasPortalAccess = customer
      ? await customerHasResidentPortalAccess(customerId).catch(() => false)
      : false;
    if (customer && hasPortalAccess) {
      return { ok: false, reason: 'core_error', errorMessage };
    }
    if (customer) {
      return { ok: false, reason: 'incomplete', errorMessage };
    }
    return { ok: false, reason: 'core_error', errorMessage };
  }
}
