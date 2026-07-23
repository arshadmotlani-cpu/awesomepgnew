import type { AdminVacatingRow } from '@/src/db/queries/admin';
import { normalizeIsoDateOnly, toIsoTimestampSafe } from '@/src/lib/dates';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import {
  buildVacatingApprovalPreview,
  buildVacatingApprovalPreviewAsync,
  type VacatingApprovalPreview,
  type VacatingApprovalPreviewRow,
} from '@/src/lib/vacating/approvalPreview';

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

function normalizeVacatingRow(row: VacatingApprovalPreviewRow): VacatingApprovalPreviewRow {
  return {
    ...row,
    noticeGivenDate: normalizeIsoDateOnly(row.noticeGivenDate),
    vacatingDate: normalizeIsoDateOnly(row.vacatingDate),
    deductionPaise: guardDepositPaise(row.deductionPaise),
    depositRefundPaise: guardDepositPaise(row.depositRefundPaise),
    monthlyRentPaiseSnapshot: guardDepositPaise(row.monthlyRentPaiseSnapshot),
  };
}

export function toMoveOutAdvancedToolsRow(
  row: VacatingApprovalPreviewRow,
  depositHeldPaise: number,
): MoveOutAdvancedToolsRow {
  const normalizedRow = normalizeVacatingRow(row);

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

export async function toMoveOutAdvancedToolsRowAsync(
  row: VacatingApprovalPreviewRow,
  depositHeldPaise: number,
): Promise<MoveOutAdvancedToolsRow> {
  const normalizedRow = normalizeVacatingRow(row);
  const held = guardDepositPaise(depositHeldPaise);

  const approvalPreview =
    normalizedRow.status === 'pending'
      ? await buildVacatingApprovalPreviewAsync(normalizedRow, held)
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
