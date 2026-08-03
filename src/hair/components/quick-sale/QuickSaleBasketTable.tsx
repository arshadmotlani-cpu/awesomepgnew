'use client';

import { Trash2 } from 'lucide-react';
import { Input } from '@/src/hair/components/ui/input';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { priceLineFromParts } from '@/src/hair/domain/basket/gstInclusiveMath';
import type { BasketLine } from '@/src/hair/domain/basket/types';
import { discountBpsFromPaise, discountPaiseFromBps } from '@/src/hair/lib/attributionMath';
import { QuickSaleStaffRow } from '@/src/hair/components/quick-sale/QuickSaleStaffFields';

type Props = {
  lines: BasketLine[];
  staffNames?: Record<string, string>;
  onStaffNameRegistered?: (staffId: string, fullName: string) => void;
  onUpdateLine: (lineId: string, patch: Partial<BasketLine>) => void;
  onRemoveLine: (lineId: string) => void;
};

function showsGstBreakdown(line: BasketLine): boolean {
  return line.billableRef.type === 'service' || line.billableRef.type === 'product';
}

function parseRupeeInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function QuickSaleBasketTable({
  lines,
  staffNames,
  onStaffNameRegistered,
  onUpdateLine,
  onRemoveLine,
}: Props) {
  if (lines.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-fyh-text-muted">
        Search and add items to the basket
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="fyh-table-compact w-full min-w-[980px] text-left text-sm">
        <thead>
          <tr>
            <th>Item</th>
            <th className="text-right">Base</th>
            <th className="text-right">GST</th>
            <th className="text-right">Selling</th>
            <th className="min-w-[11rem]">Staff</th>
            <th className="w-16">Qty</th>
            <th className="w-20 text-right">Disc %</th>
            <th className="w-24 text-right">Final</th>
            <th className="w-10" />
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
            const gstPct = (line.snapshot.gstBps / 100).toFixed(1);
            const discPctDisplay = (priced.discountBps / 100).toFixed(1);

            return (
              <tr key={line.lineId} className="align-top">
                <td className="px-2 py-3">
                  <p className="font-semibold text-fyh-text">{line.snapshot.name}</p>
                  {line.snapshot.code ? (
                    <p className="text-xs text-fyh-text-muted">{line.snapshot.code}</p>
                  ) : null}
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-fyh-text-secondary">
                  {showsGstBreakdown(line) ? formatInrFromPaise(priced.basePaise) : '—'}
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-fyh-text-secondary">
                  {showsGstBreakdown(line) ? (
                    <span>
                      {formatInrFromPaise(priced.gstPaise)}
                      <span className="block text-[10px] text-fyh-text-muted">({gstPct}%)</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-2 py-3 text-right tabular-nums font-medium text-fyh-text">
                  {formatInrFromPaise(catalogGross)}
                </td>
                <td className="px-2 py-3">
                  <QuickSaleStaffRow
                    lineType={line.billableRef.type}
                    staff={line.staff}
                    initialNames={staffNames}
                    onNameRegistered={onStaffNameRegistered}
                    onChange={(staff) => onUpdateLine(line.lineId, { staff })}
                  />
                </td>
                <td className="px-2 py-3">
                  <Input
                    inputMode="decimal"
                    value={String(line.quantity)}
                    onChange={(e) => {
                      const quantity = Math.max(0.001, Number(e.target.value) || 1);
                      onUpdateLine(line.lineId, { quantity });
                    }}
                    className="h-9 w-16 text-center tabular-nums"
                    aria-label="Quantity"
                  />
                </td>
                <td className="px-2 py-3">
                  <Input
                    inputMode="decimal"
                    value={discPctDisplay}
                    onChange={(e) => {
                      const pct = parseRupeeInput(e.target.value);
                      if (pct == null) return;
                      const bps = Math.min(10_000, Math.round(Math.max(0, pct) * 100));
                      const discountPaise = discountPaiseFromBps(catalogGross, bps);
                      onUpdateLine(line.lineId, {
                        overridePricePaise: Math.max(0, catalogGross - discountPaise),
                      });
                    }}
                    className="h-9 w-20 text-right tabular-nums"
                    aria-label="Discount percent"
                  />
                </td>
                <td className="px-2 py-3">
                  <Input
                    inputMode="decimal"
                    value={(finalPaise / 100).toFixed(2)}
                    onChange={(e) => {
                      const rupees = parseRupeeInput(e.target.value);
                      if (rupees == null) return;
                      const overridePricePaise = Math.round(Math.max(0, rupees) * 100);
                      onUpdateLine(line.lineId, { overridePricePaise });
                    }}
                    className="h-9 w-24 text-right tabular-nums font-semibold"
                    aria-label="Final amount"
                  />
                </td>
                <td className="px-2 py-3">
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
