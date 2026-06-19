import { jsonSafe } from '@/src/lib/depositPageDebug';

export type DepositRenderSection =
  | 'booking'
  | 'invoice'
  | 'wallet'
  | 'adjustments'
  | 'settlement'
  | 'pricing'
  | 'refunds';

export type DepositDataSnapshot = {
  hasBooking: boolean;
  hasCustomer: boolean;
  hasCustomerName: boolean;
  hasCustomerPhone: boolean;
  hasInvoice: boolean;
  hasSummary: boolean;
  hasUnifiedView: boolean;
  hasWalletProps: boolean;
  hasAdjustProps: boolean;
  hasSettlementProps: boolean;
  hasPrimaryBedReservation: boolean;
  hasWebsiteDepositPaise: boolean;
  bookingStatus: string | null;
  bookingCode: string | null;
  customerId: string | null;
  loadError: string | null;
  isFrozen: boolean;
};

export function buildDepositDataSnapshot(input: {
  booking: {
    customerId: string;
    customerFullName: string | null;
    customerPhone: string | null;
    status: string;
    bookingCode: string;
  } | null;
  invoice: unknown | null;
  summary: unknown | null;
  unifiedView: unknown | null;
  walletProps: unknown | null;
  adjustProps: unknown | null;
  settlementProps: unknown | null;
  hasPrimaryBedReservation: boolean;
  websiteDepositPaise: number;
  loadError: string | null;
  isFrozen: boolean;
}): DepositDataSnapshot {
  return {
    hasBooking: Boolean(input.booking),
    hasCustomer: Boolean(input.booking?.customerId),
    hasCustomerName: Boolean(input.booking?.customerFullName),
    hasCustomerPhone: Boolean(input.booking?.customerPhone),
    hasInvoice: Boolean(input.invoice),
    hasSummary: Boolean(input.summary),
    hasUnifiedView: Boolean(input.unifiedView),
    hasWalletProps: Boolean(input.walletProps),
    hasAdjustProps: Boolean(input.adjustProps),
    hasSettlementProps: Boolean(input.settlementProps),
    hasPrimaryBedReservation: input.hasPrimaryBedReservation,
    hasWebsiteDepositPaise: input.websiteDepositPaise > 0,
    bookingStatus: input.booking?.status ?? null,
    bookingCode: input.booking?.bookingCode ?? null,
    customerId: input.booking?.customerId ?? null,
    loadError: input.loadError,
    isFrozen: input.isFrozen,
  };
}

function throwSite(error: unknown): { file: string | null; line: number | null } {
  if (!(error instanceof Error) || !error.stack) {
    return { file: null, line: null };
  }
  const frames = error.stack.split('\n').slice(1);
  for (const frame of frames) {
    const match =
      frame.match(/\((.+):(\d+):\d+\)/) ?? frame.match(/at (.+):(\d+):\d+/);
    if (match && !match[1].includes('depositRenderTrace')) {
      return { file: match[1], line: Number(match[2]) };
    }
  }
  return { file: null, line: null };
}

export function logDepositRenderStart(
  section: DepositRenderSection,
  bookingId: string,
  data?: Record<string, unknown>,
) {
  console.error('[DEPOSIT_RENDER_START]', jsonSafe({ section, bookingId, data }));
}

export function logDepositRenderOk(section: DepositRenderSection, bookingId: string) {
  console.error('[DEPOSIT_RENDER_OK]', jsonSafe({ section, bookingId }));
}

export function logDepositRenderFailed(
  section: DepositRenderSection,
  bookingId: string,
  error: unknown,
  data?: Record<string, unknown>,
) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const site = throwSite(error);
  console.error(
    '[DEPOSIT_RENDER_FAILED]',
    jsonSafe({
      section,
      bookingId,
      file: site.file,
      line: site.line,
      error: message,
      stack,
      data,
    }),
  );
}

export function parseDepositSkipFlags(raw: string | undefined): Set<string> {
  const flags = new Set<string>();
  if (!raw) return flags;
  for (const part of raw.split(',').map((s) => s.trim().toLowerCase())) {
    if (part) flags.add(part);
  }
  return flags;
}

export function shouldSkipDepositSection(
  skip: Set<string>,
  section: DepositRenderSection,
): boolean {
  if (skip.has('all') || skip.has('all-clients')) {
    if (section === 'wallet' || section === 'adjustments' || section === 'settlement') {
      return true;
    }
  }
  return skip.has(section);
}
