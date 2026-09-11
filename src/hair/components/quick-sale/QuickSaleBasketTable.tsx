'use client';

import { Trash2 } from 'lucide-react';
import { Input } from '@/src/hair/components/ui/input';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { priceLineFromParts } from '@/src/hair/domain/basket/gstInclusiveMath';
import type { BasketLine } from '@/src/hair/domain/basket/types';
import { QuickSaleDiscountPercentInput } from '@/src/hair/components/quick-sale/QuickSaleDiscountPercentInput';
import { QuickSaleStaffRow } from '@/src/hair/components/quick-sale/QuickSaleStaffFields';

type Props = {
  lines: BasketLine[];
  locked?: boolean;
  staffNames?: Record<string, string>;
  preloadedStaff?: Array<{ id: string; fullName: string }>;
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
  locked = false,
  staffNames,
  preloadedStaff,
  onStaffNameRegistered,
  onUpdateLine,
  onRemoveLine,
}: Props) {
  if (lines.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-fyh-text-muted">
        Search and add items to the basket
      </p>
    );
  }

  return (
    <div className="qs-basket-scroll overflow-x-auto overflow-y-auto">
      <table className="fyh-table-compact w-full min-w-[920px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-[color:var(--fyh-bg-surface)]">
          <tr>
            <th>Item</th>
            <th className="text-right">Base</th>
            <th className="text-right">GST</th>
            <th className="text-right">Selling</th>
            <th className="min-w-[9.5rem]">Staff</th>
            <th className="w-14">Qty</th>
            <th className="w-16 text-right">Disc %</th>
            <th className="w-20 text-right">Final</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--fyh-border)]">
          {lines.map((line) => {
            const isPrepaid = Boolean(line.prepaidRedemption);
            const isPackagePurchase = line.billableRef.type === 'package';
            const catalogGross = line.snapshot.unitSellingPricePaise * line.quantity;
            const finalPaise = isPrepaid ? 0 : (line.overridePricePaise ?? catalogGross);
            const priced = priceLineFromParts({
              unitSellingPricePaise: line.snapshot.unitSellingPricePaise,
              quantity: line.quantity,
              gstBps: line.snapshot.gstBps,
              overridePricePaise: isPrepaid ? 0 : line.overridePricePaise,
            });
            const gstPct = (line.snapshot.gstBps / 100).toFixed(0);

            return (
              <tr key={line.lineId} className="align-middle">
                <td>
                  <p className="font-medium leading-tight text-fyh-text">{line.snapshot.name}</p>
                  {line.snapshot.code ? (
                    <p className="text-[11px] leading-tight text-fyh-text-muted">{line.snapshot.code}</p>
                  ) : null}
                  {isPrepaid ? (
                    <p className="text-[10px] font-medium leading-tight text-fyh-accent">
                      Package Redemption · Prepaid · ₹0
                      {line.prepaidRedemption?.packageName
                        ? ` · ${line.prepaidRedemption.packageName}`
                        : ''}
                    </p>
                  ) : null}
                  {isPackagePurchase ? (
                    <p className="text-[10px] font-medium leading-tight text-fyh-text-muted">
                      Prepaid package sale · No staff performance
                    </p>
                  ) : null}
                </td>
                <td className="text-right tabular-nums text-fyh-text-secondary">
                  {showsGstBreakdown(line) ? formatInrFromPaise(priced.basePaise) : '—'}
                </td>
                <td className="text-right tabular-nums text-fyh-text-secondary">
                  {showsGstBreakdown(line) ? (
                    <span>
                      {formatInrFromPaise(priced.gstPaise)}
                      <span className="block text-[10px] text-fyh-text-muted">({gstPct}%)</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="text-right tabular-nums font-medium text-fyh-text">
                  {formatInrFromPaise(catalogGross)}
                </td>
                <td>
                  <QuickSaleStaffRow
                    lineType={line.billableRef.type}
                    staff={line.staff}
                    disabled={locked}
                    initialNames={staffNames}
                    preloadedStaff={preloadedStaff}
                    onNameRegistered={onStaffNameRegistered}
                    onChange={(staff) => onUpdateLine(line.lineId, { staff })}
                  />
                </td>
                <td>
                  <Input
                    inputMode="decimal"
                    value={String(line.quantity)}
                    disabled={locked || isPrepaid}
                    onChange={(e) => {
                      const quantity = Math.max(0.001, Number(e.target.value) || 1);
                      onUpdateLine(line.lineId, { quantity });
                    }}
                    className="h-8 w-14 text-center text-xs tabular-nums"
                    aria-label="Quantity"
                  />
                </td>
                <td>
                  {isPrepaid ? (
                    <span className="block text-right tabular-nums text-fyh-text-muted">—</span>
                  ) : (
                    <QuickSaleDiscountPercentInput
                      lineId={line.lineId}
                      discountBps={priced.discountBps}
                      catalogGrossPaise={catalogGross}
                      disabled={locked}
                      onCommit={(overridePricePaise) =>
                        onUpdateLine(line.lineId, { overridePricePaise })
                      }
                    />
                  )}
                </td>
                <td>
                  {isPrepaid ? (
                    <span className="block text-right font-semibold tabular-nums text-fyh-text">
                      {formatInrFromPaise(0)}
                    </span>
                  ) : (
                    <Input
                      inputMode="decimal"
                      value={(finalPaise / 100).toFixed(2)}
                      disabled={locked}
                      onChange={(e) => {
                        const rupees = parseRupeeInput(e.target.value);
                        if (rupees == null) return;
                        const overridePricePaise = Math.round(Math.max(0, rupees) * 100);
                        onUpdateLine(line.lineId, { overridePricePaise });
                      }}
                      className="h-8 w-20 text-right text-xs tabular-nums font-semibold"
                      aria-label="Final amount"
                    />
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-fyh-text-muted transition hover:bg-white/5 hover:text-fyh-danger"
                    disabled={locked}
                    onClick={() => onRemoveLine(line.lineId)}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
