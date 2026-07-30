'use client';

import { Trash2 } from 'lucide-react';
import { Input } from '@/src/hair/components/ui/input';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { priceLineFromParts } from '@/src/hair/domain/basket/gstInclusiveMath';
import type { BasketLine } from '@/src/hair/domain/basket/types';
import { QuickSaleStaffRow } from '@/src/hair/components/quick-sale/QuickSaleStaffFields';

type Props = {
  lines: BasketLine[];
  onUpdateLine: (lineId: string, patch: Partial<BasketLine>) => void;
  onRemoveLine: (lineId: string) => void;
};

export function QuickSaleBasketTable({ lines, onUpdateLine, onRemoveLine }: Props) {
  if (lines.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-fyh-text-muted">
        Search and add items to the basket
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[color:var(--fyh-border)]">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-[11px] uppercase tracking-wide text-fyh-text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 font-medium text-right">Base</th>
            <th className="px-3 py-2 font-medium text-right">GST</th>
            <th className="px-3 py-2 font-medium text-right">Selling</th>
            <th className="px-3 py-2 font-medium">Qty</th>
            <th className="px-3 py-2 font-medium min-w-[140px]">Staff</th>
            <th className="px-3 py-2 font-medium text-right">Disc %</th>
            <th className="px-3 py-2 font-medium text-right">Final</th>
            <th className="px-3 py-2 w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--fyh-border)]">
          {lines.map((line) => {
            const catalogGross = line.snapshot.unitSellingPricePaise * line.quantity;
            const finalPaise = line.overridePricePaise ?? catalogGross;
            const priced = priceLineFromParts({
              unitSellingPricePaise: line.snapshot.unitSellingPricePaise,
              quantity: line.quantity,
              gstBps: line.snapshot.gstBps,
              overridePricePaise: line.overridePricePaise,
            });

            return (
              <tr key={line.lineId} className="align-top">
                <td className="px-3 py-3">
                  <p className="font-medium text-fyh-text">{line.snapshot.name}</p>
                  {line.snapshot.code ? (
                    <p className="text-xs text-fyh-text-muted">{line.snapshot.code}</p>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-fyh-text-secondary">
                  {formatInrFromPaise(priced.basePaise)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-fyh-text-secondary">
                  {formatInrFromPaise(priced.gstPaise)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatInrFromPaise(catalogGross)}
                </td>
                <td className="px-3 py-3">
                  <Input
                    type="number"
                    min={0.001}
                    step={1}
                    value={line.quantity}
                    onChange={(e) => {
                      const quantity = Number(e.target.value) || 1;
                      onUpdateLine(line.lineId, { quantity });
                    }}
                    className="h-9 w-16"
                  />
                </td>
                <td className="px-3 py-3">
                  <QuickSaleStaffRow
                    staffMode={line.snapshot.staffMode}
                    staff={line.staff}
                    onChange={(staff) => onUpdateLine(line.lineId, { staff })}
                  />
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-fyh-text-muted">
                  {(priced.discountBps / 100).toFixed(1)}%
                </td>
                <td className="px-3 py-3">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={finalPaise / 100}
                    onChange={(e) => {
                      const overridePricePaise = Math.round(Number(e.target.value || 0) * 100);
                      onUpdateLine(line.lineId, { overridePricePaise });
                    }}
                    className="h-9 w-24 text-right tabular-nums"
                  />
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    className="rounded-lg p-2 text-fyh-text-muted transition hover:bg-white/5 hover:text-fyh-danger"
                    onClick={() => onRemoveLine(line.lineId)}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
