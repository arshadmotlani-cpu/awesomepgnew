/** Structured logging + JSON-safe snapshots for /admin/deposits/[bookingId] loaders. */

export type DepositPageSection =
  | 'booking_query'
  | 'customer_join'
  | 'getDepositInvoiceForBooking'
  | 'getDepositSummaryForBooking'
  | 'getUnifiedDepositView'
  | 'sanitize_unified_view'
  | 'compute_totals'
  | 'primary_bed_query'
  | 'loadBedPrice'
  | 'client_props_wallet'
  | 'client_props_adjust'
  | 'client_props_settlement'
  | 'loadDepositDetailData';

export function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === 'bigint') return Number(v);
      if (v instanceof Date) return v.toISOString();
      return v;
    }),
  ) as T;
}

export function assertJsonSerializable(section: DepositPageSection, bookingId: string, value: unknown) {
  try {
    JSON.stringify(value, (_key, v) => {
      if (typeof v === 'bigint') {
        throw new TypeError(`BigInt not serializable in ${section}`);
      }
      return v;
    });
  } catch (err) {
    console.error('[DEPOSIT_PAGE_SECTION_FAILED]', section, bookingId, err);
    throw err;
  }
}

export function logDepositPageSection(
  section: DepositPageSection,
  bookingId: string,
  data: Record<string, unknown>,
) {
  console.error('[DEPOSIT_PAGE]', section, jsonSafe({ bookingId, ...data }));
}

export function wrapDepositPageSection<T>(
  section: DepositPageSection,
  bookingId: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  return Promise.resolve()
    .then(() => fn())
    .catch((error) => {
      console.error('[DEPOSIT_PAGE_SECTION_FAILED]', section, bookingId, error);
      throw error;
    });
}
