import { walletBalanceFromLedger } from '@/src/hair/domain/ledger/plan';

/** Default Client list columns, in display order. */
export const CLIENT_LIST_COLUMNS = [
  'Action',
  'Customer Name',
  'Customer Code',
  'Mobile Number',
  'Membership',
  'Package',
  'Loyalty Points',
  'Advance Balance',
  'Dues',
  'Email',
  '1st Visit Date',
  'Last Visit Date',
  'Date of Birth',
  'Gender',
] as const;

export const CLIENT_LIST_PAGE_SIZE = 25;

const GENDER_LABELS: Record<string, string> = {
  female: 'Female',
  male: 'Male',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
};

/** Same arithmetic as `sumCustomerReceivablePaise`: open debits minus receivable credits. */
export function duesFromLedgerTotals(openPaise: number, settledPaise: number): number {
  return Math.max(0, Math.floor(openPaise) - Math.floor(settledPaise));
}

export function advanceBalanceFromLedgerEntries(
  entries: Array<{ kind: string; direction: string; amountPaise: number }>,
): number {
  return walletBalanceFromLedger(entries);
}

/** Issued sale or a completed/paid appointment. Cancelled, no-show, and advance receipts are not visits. */
export function isClientVisit(input: {
  kind: 'invoice' | 'appointment';
  status: string;
  source?: string | null;
}): boolean {
  if (input.kind === 'invoice') {
    if (input.source === 'advance_payment') return false;
    return input.status === 'paid' || input.status === 'partial' || input.status === 'unpaid';
  }
  return input.status === 'completed' || input.status === 'paid';
}

export function visitDateBounds(dayKeys: Array<string | null | undefined>): {
  firstVisitOn: string | null;
  lastVisitOn: string | null;
} {
  const keys = dayKeys.filter((key): key is string => Boolean(key && /^\d{4}-\d{2}-\d{2}$/.test(key)));
  if (!keys.length) return { firstVisitOn: null, lastVisitOn: null };
  const sorted = [...keys].sort();
  return { firstVisitOn: sorted[0] ?? null, lastVisitOn: sorted[sorted.length - 1] ?? null };
}

/** Active membership is a plan, not a cash balance. Discount bps is the stored benefit. */
export function membershipListLabel(
  membership: { planName: string; discountBps: number } | null,
): string | null {
  if (!membership?.planName.trim()) return null;
  const name = membership.planName.trim();
  if (membership.discountBps <= 0) return name;
  const percent = membership.discountBps / 100;
  const shown = Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${name} · ${shown}%`;
}

export function packageListLabel(input: {
  names: string[];
  remainingCredits: number;
} | null): string | null {
  if (!input || input.remainingCredits <= 0) return null;
  const names = [...new Set(input.names.map((name) => name.trim()).filter(Boolean))];
  const credits = `${input.remainingCredits} left`;
  if (names.length === 1) return `${names[0]} · ${credits}`;
  if (names.length > 1) return `${names.length} packages · ${credits}`;
  return credits;
}

export function formatClientGender(gender: string | null | undefined): string {
  if (!gender) return '—';
  return GENDER_LABELS[gender] ?? gender;
}

export function formatClientDate(dayKey: string | null | undefined): string {
  if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return '—';
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function whatsAppHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}`;
}

export type ClientListActionId = 'view' | 'edit' | 'whatsapp' | 'archive';

export function visibleClientActions(input: {
  canEdit: boolean;
  canArchive: boolean;
  whatsAppHref: string | null;
}): ClientListActionId[] {
  const actions: ClientListActionId[] = ['view'];
  if (input.canEdit) actions.push('edit');
  if (input.whatsAppHref) actions.push('whatsapp');
  if (input.canArchive) actions.push('archive');
  return actions;
}

/** Active list hides archived customers. Historical invoices stay on the customer row. */
export function includeCustomerInClientList(isActive: boolean, includeInactive = false): boolean {
  return includeInactive || isActive;
}
