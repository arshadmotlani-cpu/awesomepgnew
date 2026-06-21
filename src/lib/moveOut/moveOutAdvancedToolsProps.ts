import type { AdminVacatingRow } from '@/src/db/queries/admin';
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
  const approvalPreview =
    row.status === 'pending' ? buildVacatingApprovalPreview(row, depositHeldPaise) : undefined;

  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    approvalPreview,
  };
}

export function mapToRecord<V>(map: Map<string, V>): Record<string, V> {
  return Object.fromEntries(map.entries());
}
