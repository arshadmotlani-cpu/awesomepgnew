import type { AdminSession } from '@/src/lib/auth/session';
import { titleCase } from '@/src/lib/format';
import {
  listCheckoutSettlements,
  type CheckoutSettlementRow,
} from '@/src/services/checkoutSettlement';
import { listPendingResidentRequestsForAdmin } from '@/src/services/residentRequests';

export type AdminRefundQueueItem =
  | {
      source: 'checkout_settlement';
      id: string;
      bookingId: string;
      bookingCode: string;
      customerName: string;
      customerPhone: string;
      pgName: string;
      roomNumber: string;
      bedCode: string;
      status: CheckoutSettlementRow['status'];
      label: string;
      href: string;
      createdAt: Date;
    }
  | {
      source: 'resident_request';
      id: string;
      bookingId: string;
      bookingCode: string | null;
      customerName: string;
      customerPhone: string;
      pgName: string;
      roomNumber: string;
      bedCode: string;
      status: string;
      label: string;
      href: string;
      createdAt: Date;
    };

const CHECKOUT_REFUND_TABS = [
  'awaiting_resident',
  'awaiting_review',
  'refund_pending',
] as const;

/** Unified refund work queue — checkout settlements (SSOT) + legacy resident_requests. */
export async function listAdminRefundQueue(session: AdminSession): Promise<AdminRefundQueueItem[]> {
  const [legacyRequests, ...checkoutGroups] = await Promise.all([
    listPendingResidentRequestsForAdmin(session),
    ...CHECKOUT_REFUND_TABS.map((tab) => listCheckoutSettlements(session, tab)),
  ]);

  const checkoutRows = checkoutGroups.flat();
  const checkoutBookingIds = new Set(checkoutRows.map((r) => r.bookingId));

  const items: AdminRefundQueueItem[] = [];

  for (const row of checkoutRows) {
    items.push({
      source: 'checkout_settlement',
      id: row.id,
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
      status: row.status,
      label: `Checkout · ${titleCase(row.status.replace(/_/g, ' '))}`,
      href: `/admin/checkout-settlements/${row.id}`,
      createdAt: row.createdAt,
    });
  }

  for (const req of legacyRequests.filter((r) => r.type === 'deposit_refund')) {
    if (checkoutBookingIds.has(req.bookingId)) continue;
    items.push({
      source: 'resident_request',
      id: req.id,
      bookingId: req.bookingId,
      bookingCode: req.bookingCode,
      customerName: req.customerName,
      customerPhone: req.customerPhone,
      pgName: req.pgName,
      roomNumber: '—',
      bedCode: '—',
      status: req.status,
      label: `Legacy request · ${titleCase(req.status.replace(/_/g, ' '))}`,
      href: '/admin/requests',
      createdAt: req.createdAt,
    });
  }

  return items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
