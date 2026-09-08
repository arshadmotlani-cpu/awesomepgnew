/**
 * Resident portal loader isolation — required vs optional dependencies.
 * Optional failures degrade locally; required failures are logged as core_error.
 */
import { logger } from '@/src/lib/logger';

export type PortalLoaderSection =
  | 'core_context'
  | 'financial_summary'
  | 'profile_tab'
  | 'stay_tab'
  | 'payments_tab'
  | 'invoices_tab'
  | 'requests_tab'
  | 'referrals_tab'
  | 'concierge_tab'
  | 'electricity_history'
  | 'electricity_explanations'
  | 'vacating_settlement'
  | 'exit_brain'
  | 'brain_snapshot';

export type PortalLoaderFailureCategory = 'core_error' | 'optional_degraded';

export type PortalSectionLoadResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; category: PortalLoaderFailureCategory };

export function logPortalLoaderFailure(input: {
  section: PortalLoaderSection;
  customerId: string;
  bookingId?: string | null;
  loader: string;
  required: boolean;
  error: unknown;
}): PortalLoaderFailureCategory {
  const errorMessage = input.error instanceof Error ? input.error.message : String(input.error);
  const category: PortalLoaderFailureCategory = input.required ? 'core_error' : 'optional_degraded';
  logger.warn('resident_portal.loader_failed', {
    portalSection: input.section,
    customerId: input.customerId,
    bookingId: input.bookingId ?? null,
    loader: input.loader,
    required: input.required,
    errorCategory: category,
    error: errorMessage,
    stack: input.error instanceof Error ? input.error.stack : undefined,
  });
  return category;
}

export async function loadPortalSectionSafe<T>(
  meta: {
    section: PortalLoaderSection;
    customerId: string;
    bookingId?: string | null;
    loader: string;
    required: boolean;
  },
  fn: () => Promise<T>,
): Promise<PortalSectionLoadResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    const category = logPortalLoaderFailure({ ...meta, error });
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      category,
    };
  }
}
