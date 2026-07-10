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
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
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

function money(paise: number): string {
  return paiseToInr(paise);
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
    href:
      d.refundableBalancePaise > 0
        ? refundConsoleHref(d.bookingId)
        : `/admin/deposits/${d.bookingId}`,
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
        href: '/admin/operations?filter=waiting_for_approval',
      }));
      return drillDown('Payments to review', rows, {
        ledgerHref: '/admin/operations?filter=waiting_for_approval',
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
