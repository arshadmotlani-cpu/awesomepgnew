import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhInvoiceLineAttributions } from '@/src/hair/db/schema';
import type { FyhInvoiceLineKind } from '@/src/hair/db/schema/billing';
import {
  buildAttributionRows,
  lineNetPaiseFromParts,
  type LineAttributionInput,
  type StaffAttributionInput,
} from '@/src/hair/lib/attributionMath';

export type { LineAttributionInput, StaffAttributionInput } from '@/src/hair/lib/attributionMath';
export {
  attributedNetForShare,
  buildAttributionRows,
  discountBpsFromPaise,
  discountPaiseFromBps,
  lineNetPaiseFromParts,
  normalizeEqualShares,
  revenueMetricForKind,
} from '@/src/hair/lib/attributionMath';

export async function persistLineAttributions(
  db: typeof hairDb,
  invoiceLineId: string,
  input: LineAttributionInput,
) {
  await db
    .delete(fyhInvoiceLineAttributions)
    .where(eq(fyhInvoiceLineAttributions.invoiceLineId, invoiceLineId));

  const drafts = buildAttributionRows(input);
  if (!drafts.length) return;

  await db.insert(fyhInvoiceLineAttributions).values(
    drafts.map((d) => ({
      invoiceLineId,
      staffId: d.staffId,
      role: d.role,
      shareBps: d.shareBps,
      attributedNetPaise: d.attributedNetPaise,
      revenueMetric: d.revenueMetric,
    })),
  );
}

export async function syncInvoiceLineAttributions(
  db: typeof hairDb,
  lines: Array<{
    id: string;
    kind: FyhInvoiceLineKind;
    unitPricePaise: number;
    quantity: number;
    discountPaise: number;
    staffId: string | null;
    servicedBy?: StaffAttributionInput[];
    soldByStaffId?: string | null;
  }>,
) {
  for (const line of lines) {
    const lineNetPaise = lineNetPaiseFromParts(
      line.unitPricePaise,
      line.quantity,
      line.discountPaise,
    );
    await persistLineAttributions(db, line.id, {
      kind: line.kind,
      lineNetPaise,
      servicedBy: line.servicedBy,
      soldByStaffId: line.soldByStaffId,
      legacyStaffId: line.staffId,
    });
  }
}
