import type { AdminVacatingRow } from '@/src/db/queries/admin';
import { normalizeIsoDateOnly, toIsoTimestampSafe } from '@/src/lib/dates';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { buildVacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';

/** JSON-safe row for advanced tools table (no Date instances). */
export type MoveOutAdvancedToolsRow = Omit<
  AdminVacatingRow,
  'createdAt' | 'updatedAt' | 'resolvedAt'
> & {
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  approvalPreview?: VacatingApprovalPreview;
};

export function toMoveOutAdvancedToolsRow(
  row: AdminVacatingRow,
  depositHeldPaise: number,
): MoveOutAdvancedToolsRow {
  const normalizedRow: AdminVacatingRow = {
    ...row,
    noticeGivenDate: normalizeIsoDateOnly(row.noticeGivenDate),
    vacatingDate: normalizeIsoDateOnly(row.vacatingDate),
    deductionPaise: guardDepositPaise(row.deductionPaise),
    depositRefundPaise: guardDepositPaise(row.depositRefundPaise),
    monthlyRentPaiseSnapshot: guardDepositPaise(row.monthlyRentPaiseSnapshot),
  };

  const approvalPreview =
    normalizedRow.status === 'pending'
      ? buildVacatingApprovalPreview(normalizedRow, guardDepositPaise(depositHeldPaise))
      : undefined;

  return {
    ...normalizedRow,
    createdAt: toIsoTimestampSafe(row.createdAt) ?? '',
    updatedAt: toIsoTimestampSafe(row.updatedAt) ?? '',
    resolvedAt: toIsoTimestampSafe(row.resolvedAt),
    approvalPreview,
  };
}

export function mapToRecord<V>(map: Map<string, V>): Record<string, V> {
  return Object.fromEntries(map.entries());
}
