import { NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { jsonSafe } from '@/src/lib/depositPageDebug';
import { loadDepositPageData } from '@/src/lib/deposits/loadDepositPageData';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SerializeIssue = {
  path: string;
  typeof: string;
  value: string;
};

function describe(value: unknown): string {
  if (typeof value === 'bigint') return `${value}n`;
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function findSerializationIssues(value: unknown, path = 'root'): SerializeIssue[] {
  const issues: SerializeIssue[] = [];
  const t = value === null ? 'null' : value instanceof Date ? 'Date' : typeof value;

  if (t === 'bigint' || t === 'undefined' || t === 'function' || t === 'symbol') {
    issues.push({ path, typeof: t, value: describe(value) });
    return issues;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      issues.push(...findSerializationIssues(item, `${path}[${index}]`));
    });
    return issues;
  }

  if (t === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      issues.push(...findSerializationIssues(child, path === 'root' ? key : `${path}.${key}`));
    }
  }

  return issues;
}

function testSection(name: string, value: unknown) {
  const issues = findSerializationIssues(value, name);
  let jsonError: string | null = null;
  try {
    JSON.stringify(jsonSafe(value));
  } catch (err) {
    jsonError = err instanceof Error ? err.message : String(err);
  }
  return {
    ok: issues.length === 0 && jsonError === null,
    issues,
    jsonError,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ bookingId: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { bookingId } = await context.params;
  const data = await loadDepositPageData(bookingId);

  const sections = {
    booking: data.booking,
    invoice: data.invoice,
    summary: data.summary,
    unifiedView: data.unifiedView,
    walletProps: data.walletProps,
    adjustProps: data.adjustProps,
    settlementProps: data.settlementProps,
    pricing: {
      requiredPaise: data.requiredPaise,
      collectedPaise: data.collectedPaise,
      deductionsPaise: data.deductionsPaise,
      refundablePaise: data.refundablePaise,
      websiteDepositPaise: data.websiteDepositPaise,
    },
  };

  const sectionResults = Object.fromEntries(
    Object.entries(sections).map(([name, value]) => [name, testSection(name, value)]),
  );

  const integrity = {
    hasBooking: Boolean(data.booking),
    hasCustomer: Boolean(data.customerId),
    hasInvoice: Boolean(data.invoice),
    hasSummary: Boolean(data.summary),
    hasUnifiedView: Boolean(data.unifiedView),
    hasWalletProps: Boolean(data.walletProps),
    collectedGtRequired: data.collectedPaise > data.requiredPaise,
    negativeRequiredPaise: data.requiredPaise < 0,
    negativeCollectedPaise: data.collectedPaise < 0,
    negativeRefundablePaise: data.refundablePaise < 0,
    ledgerEntryCount: data.summary?.entries.length ?? 0,
    depositCollectionStatus: data.booking ? undefined : null,
  };

  let fullJsonError: string | null = null;
  let payload: ReturnType<typeof jsonSafe> | null = null;
  try {
    payload = jsonSafe({ bookingId, loadError: data.loadError, integrity, sections: data });
    JSON.stringify(payload);
  } catch (err) {
    fullJsonError = err instanceof Error ? err.message : String(err);
  }

  const failedSections = Object.entries(sectionResults)
    .filter(([, result]) => !result.ok)
    .map(([name]) => name);

  return NextResponse.json({
    ok: failedSections.length === 0 && fullJsonError === null,
    bookingId,
    loadError: data.loadError,
    integrity,
    sectionResults,
    failedSections,
    fullJsonError,
    data: payload,
  });
}
