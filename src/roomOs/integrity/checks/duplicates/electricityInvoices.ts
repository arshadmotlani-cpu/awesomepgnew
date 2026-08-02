/**
 * DUP_ELEC_INVOICE_ACTIVE — scoped electricity invoice duplicate detection.
 */

import { listElectricityInvoiceDuplicateGroups } from '@/src/services/electricityInvoiceDuplicates';
import type { DuplicateFinding, PreflightCheckContext } from '@/src/roomOs/integrity/types';

export async function checkDuplicateElectricityInvoices(
  ctx: PreflightCheckContext,
): Promise<DuplicateFinding[]> {
  const groups = await listElectricityInvoiceDuplicateGroups();
  const findings: DuplicateFinding[] = [];

  for (const group of groups) {
    const pgMatch = await import('@/src/roomOs/integrity/checks/readers/resolvePgForRoom').then((m) =>
      m.resolvePgIdForRoom(group.roomId),
    );
    if (pgMatch !== ctx.scope.pgId) continue;
    if (ctx.scope.roomId && group.roomId !== ctx.scope.roomId) continue;
    if (ctx.scope.billingMonth && group.billingMonth !== ctx.scope.billingMonth) continue;

    findings.push({
      kind: 'electricity_invoice',
      severity: 'block',
      entityIds: group.invoices.map((inv) => inv.invoiceId),
      naturalKey: group.groupKey,
      reasonCode: 'DUP_ELEC_INVOICE_ACTIVE',
      description: `Duplicate electricity invoices for ${group.customerName} in room ${group.roomNumber} (${group.billingMonth}).`,
    });
  }

  return findings;
}
