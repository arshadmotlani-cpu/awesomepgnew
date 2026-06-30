import type {
  AdminElectricityInvoiceReminderRow,
  AdminRentInvoiceRow,
  BusinessMetricsSummary,
  CollectionBreakdown,
  DashboardStats,
  DepositLedgerSummaryRow,
  PgBusinessMetrics,
  RentStats,
} from '@/src/db/queries/admin';
import {
  getOccupancyByPg,
  listAdminDepositSummaries,
  listAdminElectricityInvoicesForReminders,
  listAdminPaidElectricityInvoicesForMonth,
  listAdminRentInvoices,
  listResidents,
} from '@/src/db/queries/admin';
import { ACTION_ITEM_GROUP_LABELS, ACTION_ITEM_GROUP_ORDER } from '@/src/lib/actionCenter/constants';
import type { AdminSession } from '@/src/lib/auth/session';
import type {
  ControlBoardBulkActionKind,
  ControlBoardCard,
  ControlBoardCardAccent,
  ControlBoardCategory,
  ControlBoardData,
  ControlBoardDrillDown,
  ControlBoardDrillDownRow,
} from '@/src/lib/controlBoard/types';
import { paiseToInr } from '@/src/lib/format';
import type { ActionItemRow } from '@/src/services/actionItems';
import { listOpenActionItems, listOpenActionItemsByType } from '@/src/services/actionItems';
import type { OperationsCenterData } from '@/src/services/operationsCenter';
import { getOperationsCenterData } from '@/src/services/operationsCenter';
import type { RevenueCommandCenterData } from '@/src/services/revenueCommandCenter';
import type { AdminOverviewKpis, VisitorCountSummary } from '@/src/services/visitorAnalytics';

export type ControlBoardInput = {
  billingMonth: string;
  monthLabel: string;
  summary: BusinessMetricsSummary;
  pgMetrics: PgBusinessMetrics[];
  revenue: RevenueCommandCenterData;
  operations: OperationsCenterData | null;
  dashboard: DashboardStats | null;
  rentStats: RentStats | null;
  overviewKpis: AdminOverviewKpis;
  visitors: VisitorCountSummary;
  actionItems: ActionItemRow[];
  depositByPg: Map<string, number>;
};

function card(
  id: string,
  label: string,
  value: string,
  drillDownKey: string,
  opts: {
    hint?: string;
    accent?: ControlBoardCardAccent;
    category?: ControlBoardCategory;
    priority?: 'high' | 'medium' | 'low';
    count?: number;
    href?: string;
  } = {},
): ControlBoardCard {
  return {
    id,
    label,
    value,
    hint: opts.hint,
    accent: opts.accent ?? 'indigo',
    category: opts.category ?? 'revenue',
    priority: opts.priority,
    drillDownKey,
    count: opts.count,
    href: opts.href,
  };
}

function money(paise: number): string {
  return paiseToInr(paise);
}

function pct(n: number): string {
  return `${n}%`;
}

function count(n: number): string {
  return n.toLocaleString('en-IN');
}

function buildGlobalCards(input: ControlBoardInput): ControlBoardCard[] {
  const { summary: s, revenue: r, operations: ops, dashboard: d, rentStats, overviewKpis, visitors, actionItems } =
    input;
  const cards: ControlBoardCard[] = [];

  const pushToday = (prefix: string, breakdown: CollectionBreakdown) => {
    cards.push(
      card(`${prefix}_today_total`, 'Total revenue today', money(breakdown.totalPaise), `${prefix}_today_total`, {
        hint: 'Tap to see who paid today',
        accent: 'indigo',
        category: 'revenue',
      }),
      card(`${prefix}_today_rent`, 'Rent collected today', money(breakdown.rentPaise), `${prefix}_today_rent`, {
        accent: 'emerald',
        category: 'revenue',
      }),
      card(`${prefix}_today_electricity`, 'Electricity today', money(breakdown.electricityPaise), `${prefix}_today_electricity`, {
        accent: 'sky',
        category: 'revenue',
      }),
      card(`${prefix}_today_deposit`, 'Deposits today', money(breakdown.depositPaise), `${prefix}_today_deposit`, {
        accent: 'violet',
        category: 'revenue',
        href: '/admin/deposits/collected',
      }),
    );
  };

  pushToday('rev', r.today);

  cards.push(
    card('mtd_total', 'Total collected (MTD)', money(r.mtd.totalPaise), 'mtd_total', {
      hint: input.monthLabel,
      accent: 'indigo',
      category: 'revenue',
    }),
    card('mtd_rent', 'Rent collected', money(s.incomeRentPaise), 'mtd_rent', {
      hint: `Invoices ${money(s.incomeRentInvoicePaise)}`,
      accent: 'emerald',
      category: 'revenue',
    }),
    card('mtd_electricity', 'Electricity collected', money(s.incomeElectricityPaise), 'mtd_electricity', {
      hint: `Invoices ${money(s.incomeElectricityInvoicePaise)}`,
      accent: 'sky',
      category: 'revenue',
    }),
    card('mtd_deposit', 'Deposit collected', money(r.mtd.depositPaise), 'mtd_deposit', {
      accent: 'violet',
      category: 'revenue',
      href: `/admin/deposits/collected?month=${input.billingMonth}`,
    }),
    card('extra_income', 'Extra income', money(s.extraIncomePaise), 'extra_income', {
      hint: 'Late fees on paid rent invoices',
      accent: 'orange',
      category: 'revenue',
    }),
    card('late_fees', 'Late fees collected', money(s.lateFeePaise), 'late_fees', {
      accent: 'orange',
      category: 'revenue',
    }),
  );

  const out = r.outstanding;
  cards.push(
    card('pending_rent', 'Rent pending', money(out.pendingRentInvoicesPaise), 'pending_rent', {
      hint: `${out.pendingRentInvoices} invoice${out.pendingRentInvoices === 1 ? '' : 's'}`,
      accent: 'amber',
      category: 'collections',
      priority: out.pendingRentInvoices > 0 ? 'high' : undefined,
      count: out.pendingRentInvoices,
    }),
    card('overdue_rent', 'Rent overdue', count(rentStats?.overdueCount ?? 0), 'overdue_rent', {
      accent: 'rose',
      category: 'collections',
      priority: (rentStats?.overdueCount ?? 0) > 0 ? 'high' : undefined,
      count: rentStats?.overdueCount,
    }),
    card('paid_rent', 'Rent paid', count(rentStats?.paidCount ?? 0), 'paid_rent', {
      hint: money(rentStats?.collectedPaise ?? 0),
      accent: 'emerald',
      category: 'collections',
      count: rentStats?.paidCount,
    }),
    card('rent_outstanding', 'Rent outstanding', money(rentStats?.outstandingPaise ?? 0), 'rent_outstanding', {
      accent: 'rose',
      category: 'collections',
      priority: (rentStats?.outstandingPaise ?? 0) > 0 ? 'high' : undefined,
    }),
    card('pending_electricity', 'Electricity pending', money(out.pendingElectricityInvoicesPaise), 'pending_electricity', {
      hint: `${out.pendingElectricityInvoices} invoice${out.pendingElectricityInvoices === 1 ? '' : 's'}`,
      accent: 'amber',
      category: 'collections',
      priority: out.pendingElectricityInvoices > 0 ? 'high' : undefined,
      count: out.pendingElectricityInvoices,
    }),
    card('pending_approvals', 'Payment approvals', money(out.pendingPaymentApprovalsPaise), 'pending_approvals', {
      hint: `${out.pendingPaymentApprovals} pending review`,
      accent: 'amber',
      category: 'collections',
      priority: out.pendingPaymentApprovals > 0 ? 'medium' : undefined,
      count: out.pendingPaymentApprovals,
    }),
    card('total_outstanding', 'Total outstanding', money(out.totalOutstandingPaise), 'total_outstanding', {
      accent: 'rose',
      category: 'collections',
      priority: out.totalOutstandingPaise > 0 ? 'high' : undefined,
    }),
  );

  if (ops) {
    cards.push(
      card('ops_pending_payments', 'Payments to review', count(ops.pendingPayments.count), 'ops_pending_payments', {
        accent: 'amber',
        category: 'operations',
        priority: ops.pendingPayments.count > 0 ? 'high' : undefined,
        count: ops.pendingPayments.count,
      }),
      card('ops_kyc', 'KYC pending', count(ops.pendingKyc.count), 'ops_kyc', {
        accent: 'amber',
        category: 'operations',
        priority: ops.pendingKyc.count > 0 ? 'medium' : undefined,
        count: ops.pendingKyc.count,
      }),
      card('ops_leaving', 'Vacating this month', count(ops.leavingSoon.count), 'ops_leaving', {
        accent: 'rose',
        category: 'operations',
        count: ops.leavingSoon.count,
      }),
      card('ops_beds_releasing', 'Beds releasing soon', count(ops.bedsReleasingSoon.count), 'ops_beds_releasing', {
        accent: 'violet',
        category: 'operations',
        count: ops.bedsReleasingSoon.count,
      }),
      card('ops_reservations', 'Upcoming check-ins', count(ops.upcomingReservations.count), 'ops_reservations', {
        accent: 'sky',
        category: 'operations',
        count: ops.upcomingReservations.count,
      }),
      card('ops_refunds', 'Refunds pending', count(ops.refundsPending.count), 'ops_refunds', {
        accent: 'rose',
        category: 'operations',
        priority: ops.refundsPending.count > 0 ? 'high' : undefined,
        count: ops.refundsPending.count,
      }),
      card('ops_electricity', 'Electricity due', count(ops.electricityPending.count), 'ops_electricity', {
        accent: 'amber',
        category: 'operations',
        count: ops.electricityPending.count,
      }),
      card('ops_ps4', 'PS4 renewals', count(ops.ps4Renewals.count), 'ops_ps4', {
        accent: 'zinc',
        category: 'operations',
        count: ops.ps4Renewals.count,
      }),
    );
  }

  cards.push(
    card('occupancy', 'Occupancy', pct(s.occupancyPct), 'occupancy', {
      hint: `${s.occupiedBeds}/${s.totalBeds} beds occupied`,
      accent: 'violet',
      category: 'inventory',
    }),
    card('occupied_beds', 'Occupied beds', count(s.occupiedBeds), 'occupied_beds', {
      accent: 'emerald',
      category: 'inventory',
      count: s.occupiedBeds,
    }),
    card('available_beds', 'Bed availability', count(s.availableBeds), 'available_beds', {
      accent: 'sky',
      category: 'inventory',
      count: s.availableBeds,
    }),
  );

  if (d) {
    cards.push(
      card('total_pgs', 'Active PGs', count(d.totalPgs), 'total_pgs', { category: 'inventory', accent: 'indigo' }),
      card('total_floors', 'Floors', count(d.totalFloors), 'total_floors', { category: 'inventory', accent: 'zinc' }),
      card('total_rooms', 'Rooms', count(d.totalRooms), 'total_rooms', { category: 'inventory', accent: 'zinc' }),
      card('total_beds', 'Total beds', count(d.totalBeds), 'total_beds', { category: 'inventory', accent: 'zinc' }),
      card('blocked_beds', 'Blocked beds', count(d.blockedBeds), 'blocked_beds', {
        category: 'inventory',
        accent: 'amber',
        count: d.blockedBeds,
      }),
      card('maintenance_beds', 'Maintenance beds', count(d.maintenanceBeds), 'maintenance_beds', {
        category: 'inventory',
        accent: 'rose',
        count: d.maintenanceBeds,
      }),
    );
  }

  cards.push(
    card('active_tenants', 'Active tenants', count(overviewKpis.activeTenants), 'active_tenants', {
      accent: 'emerald',
      category: 'inventory',
      count: overviewKpis.activeTenants,
    }),
    card('visitors_all', 'Website visitors', count(visitors.allTime), 'visitors_all', {
      hint: `${visitors.uniqueAllTime} unique`,
      accent: 'sky',
      category: 'analytics',
    }),
    card('visitors_today', 'Visitors today', count(visitors.today), 'visitors_today', {
      hint: `${visitors.uniqueToday} unique`,
      accent: 'sky',
      category: 'analytics',
    }),
    card('visitors_week', 'Visitors this week', count(visitors.week), 'visitors_week', {
      accent: 'sky',
      category: 'analytics',
    }),
    card('visitors_month', 'Visitors this month', count(visitors.month), 'visitors_month', {
      accent: 'sky',
      category: 'analytics',
    }),
    card('today_revenue', 'Revenue today', money(overviewKpis.todayRevenuePaise), 'today_revenue', {
      accent: 'emerald',
      category: 'analytics',
    }),
    card('monthly_revenue', 'Revenue this month', money(overviewKpis.monthlyRevenuePaise), 'monthly_revenue', {
      hint: input.monthLabel,
      accent: 'emerald',
      category: 'analytics',
    }),
    card('pending_kyc_kpi', 'KYC pending', count(overviewKpis.pendingKyc), 'pending_kyc_kpi', {
      accent: 'amber',
      category: 'operations',
      priority: overviewKpis.pendingKyc > 0 ? 'medium' : undefined,
      count: overviewKpis.pendingKyc,
    }),
    card('pending_payments_kpi', 'Pending payments', count(overviewKpis.pendingPayments), 'pending_payments_kpi', {
      accent: 'amber',
      category: 'collections',
      count: overviewKpis.pendingPayments,
    }),
  );

  for (const type of ACTION_ITEM_GROUP_ORDER) {
    const groupItems = actionItems.filter((i) => i.type === type);
    if (groupItems.length === 0) continue;
    cards.push(
      card(`action_${type}`, ACTION_ITEM_GROUP_LABELS[type], count(groupItems.length), `action_${type}`, {
        accent: type === 'rent_due' || type === 'electricity_due' ? 'rose' : 'amber',
        category: 'operations',
        priority: groupItems.some((i) => i.priority === 'high') ? 'high' : 'medium',
        count: groupItems.length,
      }),
    );
  }

  return cards;
}

function buildPgCards(input: ControlBoardInput): ControlBoardCard[] {
  const cards: ControlBoardCard[] = [];
  for (const pg of input.pgMetrics) {
    const deposit = input.depositByPg.get(pg.pgId) ?? 0;
    const total = pg.incomeTotalPaise + deposit;
    const prefix = `pg_${pg.pgId}`;
    cards.push(
      card(`${prefix}_total`, `${pg.pgName} · Total`, money(total), `${prefix}_total`, {
        hint: input.monthLabel,
        accent: 'indigo',
        category: 'pg',
      }),
      card(`${prefix}_rent`, `${pg.pgName} · Rent`, money(pg.incomeRentPaise), `${prefix}_rent`, {
        accent: 'emerald',
        category: 'pg',
      }),
      card(`${prefix}_electricity`, `${pg.pgName} · Electricity`, money(pg.incomeElectricityPaise), `${prefix}_electricity`, {
        accent: 'sky',
        category: 'pg',
      }),
      card(`${prefix}_deposit`, `${pg.pgName} · Deposits`, money(deposit), `${prefix}_deposit`, {
        accent: 'violet',
        category: 'pg',
        href: `/admin/deposits/collected?month=${input.billingMonth}&pgId=${pg.pgId}`,
      }),
      card(`${prefix}_occupancy`, `${pg.pgName} · Occupancy`, pct(pg.occupancyPct), `${prefix}_occupancy`, {
        hint: `${pg.occupiedBeds}/${pg.totalBeds} beds`,
        accent: 'violet',
        category: 'pg',
      }),
    );
  }
  return cards;
}

export function buildControlBoardData(input: ControlBoardInput): ControlBoardData {
  const cards = [...buildGlobalCards(input), ...buildPgCards(input)];
  return {
    cards,
    billingMonth: input.billingMonth,
    monthLabel: input.monthLabel,
  };
}

function rowFromRentInvoice(r: AdminRentInvoiceRow): ControlBoardDrillDownRow {
  return {
    id: r.id,
    residentName: r.customerFullName,
    phone: r.customerPhone,
    pgName: r.pgName,
    roomNumber: r.roomNumber,
    bedCode: r.bedCode,
    amountPaise: r.outstandingPaise,
    status: r.effectiveStatus,
    timestamp: r.paidAt?.toISOString() ?? r.createdAt.toISOString(),
    meta: r.invoiceNumber,
    billingKind: 'rent',
    billingMonth: r.billingMonth,
    dueDate: r.dueDate,
    isOverdue: r.effectiveStatus === 'overdue',
    href: `/admin/rent?status=${r.status}`,
  };
}

function rowFromElecInvoice(r: AdminElectricityInvoiceReminderRow): ControlBoardDrillDownRow {
  return {
    id: r.id,
    residentName: r.customerFullName,
    phone: r.customerPhone,
    pgName: r.pgName,
    roomNumber: r.roomNumber,
    amountPaise: r.outstandingPaise,
    status: r.effectiveStatus,
    meta: r.invoiceNumber,
    billingKind: 'electricity',
    billingMonth: r.billingMonth,
    dueDate: r.dueDate,
    isOverdue: r.isOverdue,
    href: '/admin/electricity/dashboard',
  };
}

function rowFromDeposit(d: DepositLedgerSummaryRow): ControlBoardDrillDownRow {
  return {
    id: d.bookingId,
    residentName: d.customerFullName,
    phone: d.customerPhone,
    pgName: d.pgName,
    bedCode: d.bedCode,
    amountPaise: d.collectedPaise,
    status: d.refundableBalancePaise > 0 ? 'held' : 'settled',
    meta: `Refundable ${money(d.refundableBalancePaise)}`,
    bookingId: d.bookingId,
    billingKind: 'deposit',
    href: `/admin/deposits/${d.bookingId}`,
  };
}

function rowFromActionItem(item: ActionItemRow): ControlBoardDrillDownRow {
  return {
    id: item.id,
    residentName: item.residentName ?? item.title,
    phone: item.metadata.residentPhone,
    pgName: item.pgName,
    roomNumber: item.roomNumber ?? undefined,
    bedCode: item.bedCode ?? undefined,
    amountPaise: item.amount ?? undefined,
    status: item.status,
    timestamp: item.dueDate ?? item.createdAt.toISOString(),
    meta: item.title,
    actionItemId: item.id,
    bookingId: item.metadata.bookingId,
    dueDate: item.dueDate ?? undefined,
    isOverdue: item.metadata.isOverdue,
    billingKind:
      item.type === 'rent_due' ? 'rent' : item.type === 'electricity_due' ? 'electricity' : undefined,
    billingMonth: item.metadata.billingMonth,
  };
}

function drillDown(
  title: string,
  rows: ControlBoardDrillDownRow[],
  opts: {
    subtitle?: string;
    bulkActionKind?: ControlBoardBulkActionKind;
    ledgerHref?: string;
    resolveAllActionItemType?: string;
  } = {},
): ControlBoardDrillDown {
  return {
    title,
    subtitle: opts.subtitle,
    rows,
    bulkActionKind: opts.bulkActionKind ?? 'none',
    ledgerHref: opts.ledgerHref,
    resolveAllActionItemType: opts.resolveAllActionItemType,
  };
}

export async function loadControlBoardDrillDown(
  session: AdminSession,
  drillDownKey: string,
  billingMonth: string,
): Promise<ControlBoardDrillDown | null> {
  const pgMatch = drillDownKey.match(/^pg_([^_]+)_(.+)$/);
  if (pgMatch) {
    const pgId = pgMatch[1]!;
    const kind = pgMatch[2]!;
    return loadPgDrillDown(session, pgId, kind, billingMonth);
  }

  if (drillDownKey.startsWith('action_')) {
    const type = drillDownKey.replace('action_', '') as ActionItemRow['type'];
    const filtered = await listOpenActionItemsByType(session, type);
    const bulkKind: ControlBoardBulkActionKind =
      type === 'rent_due' ? 'rent' : type === 'electricity_due' ? 'electricity' : type === 'kyc_pending' ? 'kyc' : 'none';
    return drillDown(ACTION_ITEM_GROUP_LABELS[type], filtered.map(rowFromActionItem), {
      bulkActionKind: bulkKind,
      resolveAllActionItemType: type,
    });
  }

  switch (drillDownKey) {
    case 'mtd_rent':
    case 'paid_rent': {
      const res = await listAdminRentInvoices(
        drillDownKey === 'paid_rent'
          ? { status: 'paid' }
          : { status: 'paid', billingMonth },
      );
      if (!res.ok) return null;
      const rows = res.data.map(rowFromRentInvoice);
      return drillDown(
        drillDownKey === 'paid_rent' ? 'Rent paid' : 'Rent collected this month',
        rows,
        { bulkActionKind: 'none', ledgerHref: '/admin/rent' },
      );
    }
    case 'pending_rent':
    case 'overdue_rent':
    case 'rent_outstanding': {
      const status = drillDownKey === 'overdue_rent' ? 'overdue' : 'pending';
      const res = await listAdminRentInvoices({ status: drillDownKey === 'rent_outstanding' ? undefined : status });
      if (!res.ok) return null;
      const rows = res.data
        .filter((r) =>
          drillDownKey === 'rent_outstanding'
            ? r.status === 'pending' || r.status === 'overdue'
            : true,
        )
        .map(rowFromRentInvoice);
      return drillDown(
        drillDownKey === 'overdue_rent' ? 'Overdue rent' : 'Rent pending',
        rows,
        { bulkActionKind: 'rent', ledgerHref: '/admin/rent' },
      );
    }
    case 'mtd_deposit':
    case 'mtd_total':
    case 'rev_today_deposit': {
      const res = await listAdminDepositSummaries();
      if (!res.ok) return null;
      const rows = res.data.filter((d) => d.collectedPaise > 0).map(rowFromDeposit);
      return drillDown('Deposit collected', rows, {
        bulkActionKind: 'none',
        ledgerHref: '/admin/deposits',
      });
    }
    case 'pending_electricity':
    case 'mtd_electricity':
    case 'ops_electricity': {
      if (drillDownKey === 'mtd_electricity') {
        const paid = await listAdminPaidElectricityInvoicesForMonth(billingMonth);
        if (!paid.ok) return null;
        return drillDown('Electricity collected this month', paid.data.map(rowFromElecInvoice), {
          ledgerHref: '/admin/electricity/dashboard',
        });
      }
      const res = await listAdminElectricityInvoicesForReminders();
      if (!res.ok) return null;
      return drillDown('Electricity pending', res.data.map(rowFromElecInvoice), {
        bulkActionKind: 'electricity',
        ledgerHref: '/admin/electricity/dashboard',
      });
    }
    case 'deposit_refunds':
    case 'ops_refunds': {
      const res = await listAdminDepositSummaries();
      if (!res.ok) return null;
      const rows = res.data
        .filter((d) => d.refundedPaise > 0 || d.refundableBalancePaise > 0)
        .map((d) => ({
          ...rowFromDeposit(d),
          amountPaise: d.refundedPaise || d.refundableBalancePaise,
          status: d.refundedPaise > 0 ? 'refunded' : 'pending refund',
        }));
      return drillDown('Refunds & deposit balances', rows, { ledgerHref: '/admin/deposits' });
    }
    case 'ops_kyc':
    case 'pending_kyc_kpi': {
      const res = await listResidents();
      if (!res.ok) return null;
      const rows = res.data
        .filter((r) => r.kycStatus === 'pending')
        .map((r) => ({
          id: r.id,
          residentName: r.fullName,
          phone: r.phone,
          pgName: '—',
          status: 'pending',
          timestamp: r.createdAt.toISOString(),
          href: `/admin/residents/kyc`,
        }));
      return drillDown('KYC pending', rows, { bulkActionKind: 'kyc', ledgerHref: '/admin/residents/kyc' });
    }
    case 'active_tenants': {
      const res = await listResidents();
      if (!res.ok) return null;
      const rows = res.data.map((r) => ({
        id: r.id,
        residentName: r.fullName,
        phone: r.phone,
        pgName: '—',
        status: r.kycStatus,
        timestamp: r.createdAt.toISOString(),
        href: `/admin/residents/${r.id}`,
      }));
      return drillDown('Residents', rows, { ledgerHref: '/admin/residents' });
    }
    case 'occupancy':
    case 'occupied_beds':
    case 'available_beds': {
      const res = await getOccupancyByPg();
      if (!res.ok) return null;
      const rows = res.data.map((pg) => ({
        id: pg.pgId,
        residentName: pg.pgName,
        pgName: pg.pgName,
        amountPaise: undefined,
        status: `${pg.occupancyPct}% occupied`,
        meta: `${pg.occupiedBeds}/${pg.totalBeds} beds · ${pg.availableBeds} available`,
        href: `/admin/pgs/${pg.pgId}/map`,
      }));
      return drillDown('Occupancy by PG', rows, { ledgerHref: '/admin/pgs' });
    }
    case 'total_pgs': {
      const res = await getOccupancyByPg();
      if (!res.ok) return null;
      const rows = res.data.map((pg) => ({
        id: pg.pgId,
        residentName: pg.pgName,
        pgName: pg.pgName,
        status: `${pg.totalBeds} beds`,
        meta: `${pg.occupancyPct}% occupied`,
        href: `/admin/pgs/${pg.pgId}/edit`,
      }));
      return drillDown('PG listings', rows, { ledgerHref: '/admin/pgs' });
    }
    case 'ops_pending_payments':
    case 'pending_approvals':
    case 'pending_payments_kpi': {
      const ops = await getOperationsCenterData(session);
      const rows = ops.pendingPayments.items.map((p) => ({
        id: p.key,
        residentName: p.title,
        pgName: p.pgName,
        amountPaise: p.amountPaise,
        status: 'pending review',
        href: '/admin/operations?filter=payment_proof',
      }));
      return drillDown('Payments to review', rows, {
        ledgerHref: '/admin/operations?filter=payment_proof',
      });
    }
    case 'ops_leaving': {
      const ops = await getOperationsCenterData(session);
      const rows = ops.leavingSoon.items.map((v) => ({
        id: v.id,
        residentName: v.residentName,
        pgName: v.pgName,
        roomNumber: v.roomNumber,
        bedCode: v.bedCode,
        status: `${v.daysRemaining} days left`,
        dueDate: v.vacatingDate,
        href: '/admin/vacating',
      }));
      return drillDown('Vacating this month', rows, { ledgerHref: '/admin/vacating' });
    }
    case 'ops_beds_releasing': {
      const ops = await getOperationsCenterData(session);
      const rows = ops.bedsReleasingSoon.items.map((b) => ({
        id: b.id,
        residentName: b.bedCode,
        pgName: b.pgName,
        roomNumber: b.roomNumber,
        bedCode: b.bedCode,
        status: `Free in ${b.daysRemaining} days`,
        dueDate: b.vacatingDate,
        href: '/admin/pgs',
      }));
      return drillDown('Beds releasing soon', rows, { ledgerHref: '/admin/pgs' });
    }
    case 'ops_reservations': {
      const ops = await getOperationsCenterData(session);
      const rows = ops.upcomingReservations.items.map((r) => ({
        id: r.id,
        residentName: r.residentName,
        pgName: r.pgName,
        roomNumber: r.roomNumber,
        bedCode: r.bedCode,
        status: 'upcoming',
        dueDate: r.checkInDate,
        href: '/admin/bookings',
      }));
      return drillDown('Upcoming check-ins', rows, { ledgerHref: '/admin/bookings' });
    }
    case 'ops_ps4': {
      const ops = await getOperationsCenterData(session);
      const rows = ops.ps4Renewals.items.map((p) => ({
        id: p.membershipId,
        residentName: p.residentName,
        pgName: p.pgName,
        status: 'renewal due',
        timestamp: p.expiresAt.toISOString(),
        href: '/admin/playstation',
      }));
      return drillDown('PS4 renewals', rows, { ledgerHref: '/admin/playstation' });
    }
    case 'total_outstanding': {
      const [rentRes, elecRes] = await Promise.all([
        listAdminRentInvoices(),
        listAdminElectricityInvoicesForReminders(),
      ]);
      const rows = [
        ...(rentRes.ok
          ? rentRes.data
              .filter((r) => r.status === 'pending' || r.status === 'overdue')
              .map(rowFromRentInvoice)
          : []),
        ...(elecRes.ok ? elecRes.data.map(rowFromElecInvoice) : []),
      ];
      return drillDown('Total outstanding', rows, {
        bulkActionKind: 'rent',
        ledgerHref: '/admin/rent',
      });
    }
    default: {
      return drillDown('Details', [], {
        subtitle: 'Use the ledger link for full records on this metric.',
        ledgerHref: '/admin/overview',
      });
    }
  }
}

async function loadPgDrillDown(
  session: AdminSession,
  pgId: string,
  kind: string,
  billingMonth: string,
): Promise<ControlBoardDrillDown | null> {
  void session;
  switch (kind) {
    case 'rent': {
      const res = await listAdminRentInvoices({ pgId, status: 'paid' });
      if (!res.ok) return null;
      return drillDown('PG rent collected', res.data.filter((r) => r.billingMonth === billingMonth).map(rowFromRentInvoice), {
        ledgerHref: `/admin/pgs/${pgId}/collections`,
      });
    }
    case 'electricity': {
      const res = await listAdminElectricityInvoicesForReminders({ pgId });
      if (!res.ok) return null;
      return drillDown('PG electricity', res.data.map(rowFromElecInvoice), {
        bulkActionKind: 'electricity',
        ledgerHref: `/admin/pgs/${pgId}/collections`,
      });
    }
    case 'deposit': {
      const res = await listAdminDepositSummaries();
      if (!res.ok) return null;
      const rows = res.data.filter((d) => d.collectedPaise > 0).map(rowFromDeposit);
      return drillDown('PG deposits', rows, { ledgerHref: `/admin/deposits` });
    }
    case 'occupancy':
    case 'total':
    case 'expected': {
      const res = await getOccupancyByPg();
      if (!res.ok) return null;
      const pg = res.data.find((p) => p.pgId === pgId);
      if (!pg) return drillDown('PG details', [], { ledgerHref: `/admin/pgs/${pgId}/edit` });
      return drillDown(pg.pgName, [
        {
          id: pg.pgId,
          residentName: pg.pgName,
          pgName: pg.pgName,
          status: `${pg.occupancyPct}% occupied`,
          meta: `${pg.occupiedBeds} occupied · ${pg.availableBeds} available · ${pg.blockedBeds} blocked`,
          href: `/admin/pgs/${pgId}/map`,
        },
      ], { ledgerHref: `/admin/pgs/${pgId}/collections` });
    }
    default:
      return null;
  }
}
