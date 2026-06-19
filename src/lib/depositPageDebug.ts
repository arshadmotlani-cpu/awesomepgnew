/** Structured logging + JSON-safe snapshots for /admin/deposits/[bookingId] loaders. */

export type DepositPageSection =
  | 'booking_query'
  | 'customer_join'
  | 'getDepositInvoiceForBooking'
  | 'getDepositSummaryForBooking'
  | 'getDepositWalletQuery'
  | 'getDepositLedgerQuery'
  | 'getUnifiedDepositView'
  | 'sanitize_unified_view'
  | 'compute_totals'
  | 'primary_bed_query'
  | 'bed_reservation_query'
  | 'loadBedPrice'
  | 'pricing_query'
  | 'settlement_query'
  | 'refund_query'
  | 'overview_query'
  | 'client_props_wallet'
  | 'client_props_adjust'
  | 'client_props_settlement'
  | 'depositAdjustProps'
  | 'loadDepositDetailData'
  | 'editDepositSummaryAction'
  | 'updateDepositSummaryAdmin'
  | 'syncDepositCollectionFromLedger'
  | 'post_save_db_snapshot';

export type UnsafeField = {
  path: string;
  type: string;
  value: string;
};

const UNSAFE_TYPES = new Set([
  'bigint',
  'undefined',
  'symbol',
  'function',
]);

function describeValue(value: unknown): string {
  if (typeof value === 'bigint') return `${value}n`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) return `Map(${value.size})`;
  if (value instanceof Set) return `Set(${value.size})`;
  if (typeof value === 'function') return value.name || 'anonymous';
  if (typeof value === 'symbol') return value.toString();
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Walk a value tree and return every non-JSON/RSC-safe field with its dot path. */
export function findUnsafeFields(value: unknown, path = 'root'): UnsafeField[] {
  const found: UnsafeField[] = [];
  const type = value === null ? 'null' : value instanceof Date ? 'Date' : value instanceof Map ? 'Map' : value instanceof Set ? 'Set' : typeof value;

  if (UNSAFE_TYPES.has(type) || type === 'Date' || type === 'Map' || type === 'Set') {
    found.push({ path, type, value: describeValue(value) });
    return found;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      found.push(...findUnsafeFields(item, `${path}[${index}]`));
    });
    return found;
  }

  if (type === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      found.push(...findUnsafeFields(child, path === 'root' ? key : `${path}.${key}`));
    }
  }

  return found;
}

export function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === 'bigint') return Number(v);
      if (v instanceof Date) return v.toISOString();
      return v;
    }),
  ) as T;
}

export function logDepositTrace(
  section: DepositPageSection,
  bookingId: string,
  data: Record<string, unknown>,
) {
  console.error('[DEPOSIT_TRACE]', jsonSafe({ section, bookingId, ...data }));
}

export function assertJsonSerializable(section: DepositPageSection, bookingId: string, value: unknown) {
  const unsafe = findUnsafeFields(value);
  if (unsafe.length > 0) {
    for (const field of unsafe) {
      console.error('[DEPOSIT_TRACE]', {
        section,
        bookingId,
        unsafeField: field.path,
        type: field.type,
        value: field.value,
      });
    }
    const summary = unsafe.map((f) => `${f.path} type=${f.type} value=${f.value}`).join('; ');
    const err = new TypeError(`RSC-unsafe value in ${section}: ${summary}`);
    console.error('[DEPOSIT_PAGE_SECTION_FAILED]', section, bookingId, err);
    throw err;
  }

  try {
    JSON.stringify(value);
  } catch (err) {
    console.error('[DEPOSIT_TRACE]', { section, bookingId, error: err });
    console.error('[DEPOSIT_PAGE_SECTION_FAILED]', section, bookingId, err);
    throw err;
  }
}

export function logDepositPageSection(
  section: DepositPageSection,
  bookingId: string,
  data: Record<string, unknown>,
) {
  logDepositTrace(section, bookingId, data);
}

export function wrapDepositPageSection<T>(
  section: DepositPageSection,
  bookingId: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  return Promise.resolve()
    .then(() => fn())
    .catch((error) => {
      console.error('[DEPOSIT_TRACE]', { section, bookingId, error });
      console.error('[DEPOSIT_PAGE_SECTION_FAILED]', section, bookingId, error);
      throw error;
    });
}
