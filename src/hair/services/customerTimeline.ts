import { and, asc, desc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhAppointments,
  fyhCustomerMemberships,
  fyhCustomerNotes,
  fyhCustomerPackages,
  fyhCustomerTimeline,
  fyhFinancialLedger,
  fyhInvoicePayments,
  fyhInvoices,
  fyhMembershipPlans,
  fyhPackagePlans,
} from '@/src/hair/db/schema';
import type { FyhTimelineEventType } from '@/src/hair/db/schema/customerActivity';
import type { LedgerKind } from '@/src/hair/domain/ledger/types';
import { walletBalanceFromLedger } from '@/src/hair/domain/ledger/plan';
import { sumCustomerReceivablePaise } from '@/src/hair/domain/ledger/service';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import {
  sortUnifiedTimeline,
  type CustomerFinancialSummary,
  type UnifiedTimelineCategory,
  type UnifiedTimelineEvent,
} from '@/src/hair/domain/customerTimeline/types';

export type {
  CustomerFinancialSummary,
  UnifiedTimelineCategory,
  UnifiedTimelineEvent,
  UnifiedTimelineFilter,
} from '@/src/hair/domain/customerTimeline/types';
export {
  DEFAULT_TIMELINE_PAGE_SIZE,
  filterUnifiedTimeline,
  paginateUnifiedTimeline,
  sortUnifiedTimeline,
} from '@/src/hair/domain/customerTimeline/types';

const TIMELINE_ONLY_EVENT_TYPES = new Set<FyhTimelineEventType>([
  'customer_created',
  'profile_updated',
  'other',
]);

const AGGREGATED_TIMELINE_EVENT_TYPES = new Set<FyhTimelineEventType>([
  'appointment',
  'bill',
  'wallet',
  'note',
  'membership',
  'package',
]);

function evt(partial: Omit<UnifiedTimelineEvent, 'id'> & { id?: string }): UnifiedTimelineEvent {
  return {
    id:
      partial.id ??
      `${partial.category}:${partial.occurredAt.getTime()}:${partial.title}:${partial.amountPaise ?? ''}`,
    ...partial,
  };
}

function timelineEventCategory(eventType: FyhTimelineEventType): UnifiedTimelineCategory {
  switch (eventType) {
    case 'appointment':
      return 'visit';
    case 'bill':
      return 'bill';
    case 'membership':
    case 'package':
      return 'loyalty';
    case 'wallet':
      return 'wallet';
    case 'note':
      return 'note';
    case 'customer_created':
    case 'profile_updated':
      return 'profile';
    default:
      return 'other';
  }
}

function ledgerCategory(kind: LedgerKind): UnifiedTimelineCategory {
  if (kind === 'payment_received') return 'payment';
  return 'wallet';
}

function ledgerTitle(kind: LedgerKind, direction: string): string {
  switch (kind) {
    case 'advance_credit':
      return 'Advance credited';
    case 'wallet_redemption':
      return 'Wallet applied to bill';
    case 'receivable_open':
      return 'Balance marked due';
    case 'receivable_settled':
      return 'Due settled';
    case 'payment_received':
      return direction === 'credit' ? 'Payment received' : 'Payment recorded';
    case 'invoice_charge':
      return 'Invoice charge';
    default:
      return kind.replace(/_/g, ' ');
  }
}

function invoiceTitle(status: string, invoiceNumber: string): string {
  if (status === 'paid') return `Invoice ${invoiceNumber} paid`;
  if (status === 'void') return `Invoice ${invoiceNumber} voided`;
  if (status === 'partial') return `Invoice ${invoiceNumber} partially paid`;
  if (status === 'unpaid') return `Invoice ${invoiceNumber} unpaid`;
  return `Invoice ${invoiceNumber}`;
}

function appointmentTitle(status: string): string {
  if (status === 'booked') return 'Appointment booked';
  if (status === 'confirmed') return 'Appointment confirmed';
  if (status === 'arrived') return 'Customer checked in';
  if (status === 'in_service') return 'Service in progress';
  if (status === 'completed') return 'Visit completed';
  if (status === 'paid') return 'Visit paid';
  if (status === 'cancelled') return 'Appointment cancelled';
  if (status === 'no_show') return 'No show';
  return `Appointment ${status.replace(/_/g, ' ')}`;
}

export async function getUnifiedCustomerTimeline(
  customerId: string,
): Promise<UnifiedTimelineEvent[]> {
  const [
    appointments,
    invoices,
    payments,
    ledgerRows,
    memberships,
    packages,
    notes,
    timelineRows,
  ] = await Promise.all([
    hairDb
      .select({
        id: fyhAppointments.id,
        status: fyhAppointments.status,
        startAt: fyhAppointments.startAt,
        createdAt: fyhAppointments.createdAt,
        updatedAt: fyhAppointments.updatedAt,
        notes: fyhAppointments.notes,
      })
      .from(fyhAppointments)
      .where(eq(fyhAppointments.customerId, customerId))
      .orderBy(desc(fyhAppointments.startAt)),
    hairDb
      .select({
        id: fyhInvoices.id,
        invoiceNumber: fyhInvoices.invoiceNumber,
        status: fyhInvoices.status,
        grandTotalPaise: fyhInvoices.grandTotalPaise,
        amountPaidPaise: fyhInvoices.amountPaidPaise,
        source: fyhInvoices.source,
        createdAt: fyhInvoices.createdAt,
        paidAt: fyhInvoices.paidAt,
      })
      .from(fyhInvoices)
      .where(eq(fyhInvoices.customerId, customerId))
      .orderBy(desc(fyhInvoices.createdAt)),
    hairDb
      .select({
        id: fyhInvoicePayments.id,
        invoiceId: fyhInvoicePayments.invoiceId,
        method: fyhInvoicePayments.method,
        amountPaise: fyhInvoicePayments.amountPaise,
        reference: fyhInvoicePayments.reference,
        notes: fyhInvoicePayments.notes,
        paidAt: fyhInvoicePayments.paidAt,
        invoiceNumber: fyhInvoices.invoiceNumber,
      })
      .from(fyhInvoicePayments)
      .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoicePayments.invoiceId))
      .where(eq(fyhInvoices.customerId, customerId))
      .orderBy(desc(fyhInvoicePayments.paidAt)),
    hairDb
      .select({
        id: fyhFinancialLedger.id,
        invoiceId: fyhFinancialLedger.invoiceId,
        account: fyhFinancialLedger.account,
        direction: fyhFinancialLedger.direction,
        amountPaise: fyhFinancialLedger.amountPaise,
        method: fyhFinancialLedger.method,
        kind: fyhFinancialLedger.kind,
        reference: fyhFinancialLedger.reference,
        createdAt: fyhFinancialLedger.createdAt,
      })
      .from(fyhFinancialLedger)
      .where(eq(fyhFinancialLedger.customerId, customerId))
      .orderBy(desc(fyhFinancialLedger.createdAt)),
    hairDb
      .select({
        id: fyhCustomerMemberships.id,
        startsOn: fyhCustomerMemberships.startsOn,
        expiresOn: fyhCustomerMemberships.expiresOn,
        isActive: fyhCustomerMemberships.isActive,
        createdAt: fyhCustomerMemberships.createdAt,
        planName: fyhMembershipPlans.name,
        pricePaise: fyhMembershipPlans.pricePaise,
      })
      .from(fyhCustomerMemberships)
      .innerJoin(fyhMembershipPlans, eq(fyhMembershipPlans.id, fyhCustomerMemberships.planId))
      .where(eq(fyhCustomerMemberships.customerId, customerId))
      .orderBy(desc(fyhCustomerMemberships.createdAt)),
    hairDb
      .select({
        id: fyhCustomerPackages.id,
        totalSessions: fyhCustomerPackages.totalSessions,
        usedSessions: fyhCustomerPackages.usedSessions,
        expiresOn: fyhCustomerPackages.expiresOn,
        isActive: fyhCustomerPackages.isActive,
        createdAt: fyhCustomerPackages.createdAt,
        planName: fyhPackagePlans.name,
        pricePaise: fyhPackagePlans.pricePaise,
      })
      .from(fyhCustomerPackages)
      .innerJoin(fyhPackagePlans, eq(fyhPackagePlans.id, fyhCustomerPackages.planId))
      .where(eq(fyhCustomerPackages.customerId, customerId))
      .orderBy(desc(fyhCustomerPackages.createdAt)),
    hairDb
      .select()
      .from(fyhCustomerNotes)
      .where(eq(fyhCustomerNotes.customerId, customerId))
      .orderBy(desc(fyhCustomerNotes.createdAt)),
    hairDb
      .select()
      .from(fyhCustomerTimeline)
      .where(eq(fyhCustomerTimeline.customerId, customerId))
      .orderBy(asc(fyhCustomerTimeline.occurredAt), asc(fyhCustomerTimeline.createdAt)),
  ]);

  const events: UnifiedTimelineEvent[] = [];
  const seenKeys = new Set<string>();

  function push(event: UnifiedTimelineEvent, dedupeKey?: string) {
    if (dedupeKey && seenKeys.has(dedupeKey)) return;
    if (dedupeKey) seenKeys.add(dedupeKey);
    events.push(event);
  }

  for (const row of timelineRows) {
    if (!TIMELINE_ONLY_EVENT_TYPES.has(row.eventType)) continue;
    push(
      evt({
        id: `timeline:${row.id}`,
        occurredAt: row.occurredAt,
        category: timelineEventCategory(row.eventType),
        title: row.title,
        body: row.body,
        metadata: row.metadata,
      }),
      `timeline:${row.id}`,
    );
  }

  for (const row of appointments) {
    const occurredAt = row.createdAt ?? row.startAt;
    push(
      evt({
        id: `appointment:${row.id}`,
        occurredAt,
        category: 'visit',
        title: appointmentTitle(row.status),
        body: row.notes,
        metadata: { appointmentId: row.id, status: row.status, startAt: row.startAt.toISOString() },
      }),
      `appointment:${row.id}:created`,
    );
  }

  for (const row of timelineRows) {
    if (row.eventType !== 'appointment') continue;
    const appointmentId =
      typeof row.metadata?.appointmentId === 'string' ? row.metadata.appointmentId : row.id;
    push(
      evt({
        id: `timeline:${row.id}`,
        occurredAt: row.occurredAt,
        category: 'visit',
        title: row.title,
        body: row.body,
        metadata: row.metadata,
      }),
      `timeline-appointment:${row.id}`,
    );
  }

  for (const row of invoices) {
    const occurredAt = row.paidAt ?? row.createdAt;
    push(
      evt({
        id: `invoice:${row.id}`,
        occurredAt,
        category: 'bill',
        title: invoiceTitle(row.status, row.invoiceNumber),
        body: `${formatInrFromPaise(row.grandTotalPaise)}${row.amountPaidPaise > 0 ? ` · paid ${formatInrFromPaise(row.amountPaidPaise)}` : ''}`,
        metadata: {
          invoiceId: row.id,
          invoiceNumber: row.invoiceNumber,
          status: row.status,
          source: row.source,
        },
        amountPaise: row.grandTotalPaise,
      }),
      `invoice:${row.id}`,
    );
  }

  for (const row of payments) {
    push(
      evt({
        id: `payment:${row.id}`,
        occurredAt: row.paidAt,
        category: 'payment',
        title: `Payment on ${row.invoiceNumber}`,
        body: `${formatInrFromPaise(row.amountPaise)} via ${row.method}${row.reference ? ` · ${row.reference}` : ''}`,
        metadata: {
          paymentId: row.id,
          invoiceId: row.invoiceId,
          invoiceNumber: row.invoiceNumber,
          method: row.method,
        },
        amountPaise: row.amountPaise,
      }),
      `payment:${row.id}`,
    );
  }

  for (const row of ledgerRows) {
    if (row.kind === 'invoice_charge') continue;
    push(
      evt({
        id: `ledger:${row.id}`,
        occurredAt: row.createdAt,
        category: ledgerCategory(row.kind),
        title: ledgerTitle(row.kind, row.direction),
        body: row.reference ?? (row.method ? `Via ${row.method}` : null),
        metadata: {
          ledgerId: row.id,
          invoiceId: row.invoiceId,
          account: row.account,
          kind: row.kind,
          direction: row.direction,
          method: row.method,
        },
        amountPaise: row.amountPaise,
      }),
      `ledger:${row.id}`,
    );
  }

  for (const row of memberships) {
    push(
      evt({
        id: `membership:${row.id}`,
        occurredAt: row.createdAt,
        category: 'loyalty',
        title: row.isActive ? `Membership · ${row.planName}` : `Membership ended · ${row.planName}`,
        body: `${formatInrFromPaise(row.pricePaise)} · ${row.startsOn} → ${row.expiresOn}`,
        metadata: {
          membershipId: row.id,
          planName: row.planName,
          isActive: row.isActive,
        },
        amountPaise: row.pricePaise,
      }),
      `membership:${row.id}`,
    );
  }

  for (const row of packages) {
    const remaining = Math.max(0, row.totalSessions - row.usedSessions);
    push(
      evt({
        id: `package:${row.id}`,
        occurredAt: row.createdAt,
        category: 'loyalty',
        title: row.isActive ? `Package · ${row.planName}` : `Package ended · ${row.planName}`,
        body: `${remaining}/${row.totalSessions} sessions remaining${row.expiresOn ? ` · expires ${row.expiresOn}` : ''}`,
        metadata: {
          packageId: row.id,
          planName: row.planName,
          isActive: row.isActive,
          remainingSessions: remaining,
        },
        amountPaise: row.pricePaise,
      }),
      `package:${row.id}`,
    );
  }

  for (const row of notes) {
    push(
      evt({
        id: `note:${row.id}`,
        occurredAt: row.createdAt,
        category: 'note',
        title: row.isAlert ? 'Alert note' : 'Note added',
        body: row.body,
        metadata: { noteId: row.id, isAlert: row.isAlert },
      }),
      `note:${row.id}`,
    );
  }

  for (const row of timelineRows) {
    if (!AGGREGATED_TIMELINE_EVENT_TYPES.has(row.eventType)) continue;
    if (row.eventType === 'appointment') continue;
    const invoiceId =
      typeof row.metadata?.invoiceId === 'string' ? row.metadata.invoiceId : null;
    if (row.eventType === 'bill' && invoiceId && seenKeys.has(`invoice:${invoiceId}`)) continue;
    if (row.eventType === 'wallet' && seenKeys.has(`timeline:${row.id}`)) continue;
    push(
      evt({
        id: `timeline:${row.id}`,
        occurredAt: row.occurredAt,
        category: timelineEventCategory(row.eventType),
        title: row.title,
        body: row.body,
        metadata: row.metadata,
        amountPaise:
          typeof row.metadata?.amountPaise === 'number' ? row.metadata.amountPaise : undefined,
      }),
      `timeline:${row.id}`,
    );
  }

  return sortUnifiedTimeline(events);
}

async function sumCustomerAdvanceCreditPaise(customerId: string): Promise<number> {
  const rows = await hairDb
    .select({
      kind: fyhFinancialLedger.kind,
      direction: fyhFinancialLedger.direction,
      amountPaise: fyhFinancialLedger.amountPaise,
    })
    .from(fyhFinancialLedger)
    .where(
      and(
        eq(fyhFinancialLedger.customerId, customerId),
        eq(fyhFinancialLedger.kind, 'advance_credit'),
        eq(fyhFinancialLedger.direction, 'credit'),
      ),
    );

  return rows.reduce((sum, row) => sum + row.amountPaise, 0);
}

export async function getCustomerFinancialSummary(
  customerId: string,
): Promise<CustomerFinancialSummary> {
  const [duePaise, advancePaise, walletLedgerRows, activeMembershipRow, activePackageRow] =
    await Promise.all([
      sumCustomerReceivablePaise(hairDb, customerId),
      sumCustomerAdvanceCreditPaise(customerId),
      hairDb
        .select({
          kind: fyhFinancialLedger.kind,
          direction: fyhFinancialLedger.direction,
          amountPaise: fyhFinancialLedger.amountPaise,
        })
        .from(fyhFinancialLedger)
        .where(eq(fyhFinancialLedger.customerId, customerId)),
      hairDb
        .select({
          id: fyhCustomerMemberships.id,
          expiresOn: fyhCustomerMemberships.expiresOn,
          planName: fyhMembershipPlans.name,
        })
        .from(fyhCustomerMemberships)
        .innerJoin(fyhMembershipPlans, eq(fyhMembershipPlans.id, fyhCustomerMemberships.planId))
        .where(
          and(
            eq(fyhCustomerMemberships.customerId, customerId),
            eq(fyhCustomerMemberships.isActive, true),
          ),
        )
        .orderBy(desc(fyhCustomerMemberships.createdAt))
        .limit(1),
      hairDb
        .select({
          id: fyhCustomerPackages.id,
          totalSessions: fyhCustomerPackages.totalSessions,
          usedSessions: fyhCustomerPackages.usedSessions,
          expiresOn: fyhCustomerPackages.expiresOn,
          planName: fyhPackagePlans.name,
        })
        .from(fyhCustomerPackages)
        .innerJoin(fyhPackagePlans, eq(fyhPackagePlans.id, fyhCustomerPackages.planId))
        .where(
          and(eq(fyhCustomerPackages.customerId, customerId), eq(fyhCustomerPackages.isActive, true)),
        )
        .orderBy(desc(fyhCustomerPackages.createdAt))
        .limit(1),
    ]);

  const activeMembership = activeMembershipRow[0]
    ? {
        id: activeMembershipRow[0].id,
        planName: activeMembershipRow[0].planName,
        expiresOn: activeMembershipRow[0].expiresOn,
      }
    : null;

  const activePackage = activePackageRow[0]
    ? {
        id: activePackageRow[0].id,
        planName: activePackageRow[0].planName,
        remainingSessions: Math.max(
          0,
          activePackageRow[0].totalSessions - activePackageRow[0].usedSessions,
        ),
        expiresOn: activePackageRow[0].expiresOn,
      }
    : null;

  return {
    duePaise,
    advancePaise,
    walletPaise: walletBalanceFromLedger(walletLedgerRows),
    activeMembership,
    activePackage,
  };
}

/** @internal exported for tests — derive wallet balance without cache write. */
export function walletBalanceFromLedgerRows(
  rows: Array<{ kind: string; direction: string; amountPaise: number }>,
): number {
  return walletBalanceFromLedger(rows);
}
