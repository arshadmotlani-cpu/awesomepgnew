import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import { jsonSafe } from '@/src/lib/depositPageDebug';
import {
  listPendingVacatingDateChangesForOps,
  type PendingVacatingDateChangeOpsRow,
} from '@/src/services/vacatingDateChange';
import type { VacatingDateChangeBookingContext } from '@/src/components/admin/vacating/VacatingDateChangeApprovalPanel';
import type { VacatingDateChangeRequest } from '@/src/db/schema/vacatingDateChangeRequests';
import { buildSettlementStatementModel } from '@/src/lib/vacating/settlementStatementModel';
import { buildFallbackPgLetterhead } from '@/src/lib/billing/pgLetterheadFallback';
import type { SettlementStatementDocumentModel } from '@/src/lib/vacating/settlementStatementModel';
import {
  toClientVacatingDateChangeRequest,
  type VacatingDateChangeRequestClient,
} from '@/src/lib/operations/vacatingDateChangeClient';

export type OperationsDateChangeBundle = {
  pendingDateChanges: VacatingDateChangeRequestClient[];
  dateChangeContextByRequestId: Record<string, VacatingDateChangeBookingContext>;
  statementDocumentByRequestId: Record<string, SettlementStatementDocumentModel | null>;
  dateChangeCount: number;
};

export function emptyOperationsDateChangeBundle(): OperationsDateChangeBundle {
  return {
    pendingDateChanges: [],
    dateChangeContextByRequestId: {},
    statementDocumentByRequestId: {},
    dateChangeCount: 0,
  };
}

function rowToRequest(row: PendingVacatingDateChangeOpsRow): VacatingDateChangeRequest {
  return {
    id: row.requestId,
    vacatingRequestId: row.vacatingRequestId,
    bookingId: row.bookingId,
    customerId: row.customerId,
    currentVacatingDate: row.currentVacatingDate,
    requestedVacatingDate: row.requestedVacatingDate,
    status: 'pending',
    currentEstimatedRefundPaise: row.preview?.currentEstimatedRefundPaise ?? 0,
    requestedEstimatedRefundPaise: row.preview?.requestedEstimatedRefundPaise ?? 0,
    refundDeltaPaise: row.refundDeltaPaise,
    previewSnapshot: row.preview,
    residentNotes: null,
    adminNotes: null,
    reviewedByAdminId: null,
    reviewedAt: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Pending move-out date changes with admin approval context for Operations. */
export async function loadOperationsDateChangeBundle(
  session: AdminSession,
): Promise<OperationsDateChangeBundle> {
  const rows = await listPendingVacatingDateChangesForOps(50);
  const scoped = rows.filter((row) =>
    adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId),
  );

  const pendingDateChanges = scoped.map((row) =>
    toClientVacatingDateChangeRequest(rowToRequest(row)),
  );
  const dateChangeContextByRequestId: Record<string, VacatingDateChangeBookingContext> = {};
  const statementDocumentByRequestId: Record<string, SettlementStatementDocumentModel | null> = {};

  for (const row of scoped) {
    dateChangeContextByRequestId[row.vacatingRequestId] = {
      vacatingRequestId: row.vacatingRequestId,
      bookingId: row.bookingId,
      customerName: row.customerName,
      customerPhone: row.customerPhone ?? undefined,
      bookingCode: row.bookingCode,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
      noticeGivenDate: row.noticeGivenDate,
      vacatingDate: row.requestedVacatingDate,
    };

    if (row.preview?.requestedEstimatedSettlement) {
      try {
        statementDocumentByRequestId[row.requestId] = buildSettlementStatementModel({
          preview: row.preview.requestedEstimatedSettlement,
          explanations: null,
          vacatingRequestId: row.vacatingRequestId,
          bookingId: row.bookingId,
          customerName: row.customerName,
          customerPhone: row.customerPhone ?? '—',
          bookingCode: row.bookingCode,
          pgName: row.pgName,
          roomNumber: row.roomNumber,
          bedCode: row.bedCode,
          noticeGivenDate: row.noticeGivenDate,
          vacatingDate: row.requestedVacatingDate,
          letterhead: buildFallbackPgLetterhead(row.pgName),
        });
      } catch {
        statementDocumentByRequestId[row.requestId] = null;
      }
    } else {
      statementDocumentByRequestId[row.requestId] = null;
    }
  }

  return jsonSafe({
    pendingDateChanges,
    dateChangeContextByRequestId,
    statementDocumentByRequestId,
    dateChangeCount: scoped.length,
  });
}
