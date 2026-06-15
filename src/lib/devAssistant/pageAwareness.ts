import { ADMIN_MODULES, type AdminModule } from '@/src/lib/admin/navigation';

const PATH_MODULE: Array<{ pattern: RegExp; module: AdminModule | null; label?: string }> = [
  { pattern: /^\/admin\/overview/, module: 'overview' },
  { pattern: /^\/admin\/revenue/, module: 'revenue' },
  { pattern: /^\/admin\/collections/, module: 'collections' },
  { pattern: /^\/admin\/invoices/, module: 'invoices' },
  { pattern: /^\/admin\/deposits/, module: 'deposits' },
  { pattern: /^\/admin\/operations/, module: 'operations' },
  { pattern: /^\/admin\/analytics/, module: 'analytics' },
  { pattern: /^\/admin\/system/, module: 'system' },
  { pattern: /^\/admin\/pgs/, module: 'pgs' },
  { pattern: /^\/admin\/residents/, module: 'residents' },
  { pattern: /^\/admin\/panel/, module: 'panel' },
  { pattern: /^\/admin\/actions/, module: 'overview', label: 'Action center' },
  { pattern: /^\/admin\/rent/, module: 'collections', label: 'Rent' },
  { pattern: /^\/admin\/electricity/, module: 'collections', label: 'Electricity' },
  { pattern: /^\/admin$/, module: 'overview', label: 'Admin home' },
];

export type PageEntityHints = {
  pgId?: string;
  pgName?: string;
  residentId?: string;
  residentName?: string;
  bedId?: string;
  bedCode?: string;
  roomId?: string;
  roomNumber?: string;
  bookingId?: string;
};

export type PageAwarenessResult = {
  pageName: string;
  entity: PageEntityHints;
  pageHints: Record<string, unknown>;
};

function readGlobalHints(): Record<string, unknown> | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { __APG_DEV_CONTEXT__?: Record<string, unknown> }).__APG_DEV_CONTEXT__;
}

function readDomHint(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const el = document.querySelector(`[data-dev-context-${name}]`);
  return el?.getAttribute(`data-dev-context-${name}`) ?? el?.textContent?.trim() ?? undefined;
}

export function resolvePageName(pathname: string): string {
  for (const entry of PATH_MODULE) {
    if (entry.pattern.test(pathname)) {
      if (entry.label) return entry.label;
      if (entry.module) return ADMIN_MODULES[entry.module].label;
    }
  }
  const segment = pathname.split('/').filter(Boolean).pop();
  return segment ? segment.replace(/-/g, ' ') : 'Admin';
}

export function parsePathEntities(pathname: string, searchParams: URLSearchParams): PageEntityHints {
  const entity: PageEntityHints = {};

  const pgMatch =
    pathname.match(/\/admin\/pgs\/([^/]+)/) ||
    pathname.match(/\/admin\/operations\/pg\/([^/]+)/) ||
    pathname.match(/\/admin\/collections\/pg\/([^/]+)/) ||
    pathname.match(/\/admin\/revenue\/pg\/([^/]+)/) ||
    pathname.match(/\/admin\/overview\/pg\/([^/]+)/);
  if (pgMatch?.[1] && pgMatch[1] !== 'new') entity.pgId = pgMatch[1];

  const residentMatch =
    pathname.match(/\/admin\/residents\/([^/]+)/) ||
    pathname.match(/\/resident\/([^/]+)/);
  if (residentMatch?.[1] && !['kyc', 'new'].includes(residentMatch[1])) {
    entity.residentId = residentMatch[1];
  }

  const bookingMatch = pathname.match(/\/admin\/bookings\/([^/]+)/);
  if (bookingMatch?.[1] && bookingMatch[1] !== 'new') entity.bookingId = bookingMatch[1];

  const depositMatch = pathname.match(/\/admin\/deposits\/([^/]+)/);
  if (depositMatch?.[1] && depositMatch[1] !== 'add') entity.bookingId = depositMatch[1];

  const invoiceMatch = pathname.match(/\/admin\/invoices\/([^/]+)/);
  if (invoiceMatch?.[1]) entity.bookingId = invoiceMatch[1];

  const pgQ = searchParams.get('pgId') ?? searchParams.get('pg');
  if (pgQ) entity.pgId = pgQ;
  const residentQ = searchParams.get('residentId') ?? searchParams.get('customerId');
  if (residentQ) entity.residentId = residentQ;
  const bedQ = searchParams.get('bedId');
  if (bedQ) entity.bedId = bedQ;
  const roomQ = searchParams.get('roomId');
  if (roomQ) entity.roomId = roomQ;

  entity.pgName = readDomHint('pg-name') ?? entity.pgName;
  entity.residentName = readDomHint('resident-name') ?? entity.residentName;
  entity.bedCode = readDomHint('bed-code') ?? entity.bedCode;
  entity.roomNumber = readDomHint('room-number') ?? entity.roomNumber;

  return entity;
}

export function collectPageAwareness(pathname: string, searchParams: URLSearchParams): PageAwarenessResult {
  const global = readGlobalHints() ?? {};
  const entity = { ...parsePathEntities(pathname, searchParams), ...(global.entity as PageEntityHints | undefined) };
  const pageHints: Record<string, unknown> = { ...(global.pageHints as Record<string, unknown> | undefined) };

  if (pathname.startsWith('/admin/analytics')) {
    pageHints.module = 'analytics';
    const tab = searchParams.get('tab');
    if (tab) pageHints.chartTab = tab;
    const range = searchParams.get('range');
    if (range) pageHints.dateRange = range;
  }
  if (pathname.startsWith('/admin/operations')) {
    pageHints.module = 'operations';
    const view = searchParams.get('view') ?? searchParams.get('tab');
    if (view) pageHints.view = view;
  }
  if (pathname.startsWith('/admin/collections') || pathname.startsWith('/admin/invoices')) {
    const tab = searchParams.get('tab');
    if (tab) pageHints.billingTab = tab;
    const month = searchParams.get('month') ?? searchParams.get('billingMonth');
    if (month) pageHints.billingMonth = month;
  }
  if (pathname.startsWith('/admin/residents')) {
    pageHints.module = 'residents';
  }

  return {
    pageName: resolvePageName(pathname),
    entity,
    pageHints,
  };
}

export function collectFilters(searchParams: URLSearchParams): Record<string, string> {
  const skip = new Set(['tab', 'view']);
  const filters: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (!skip.has(key) && value) filters[key] = value;
  });
  return filters;
}
