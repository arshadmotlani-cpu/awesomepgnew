'use client';

import { Trash2 } from 'lucide-react';
import { Input } from '@/src/hair/components/ui/input';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { priceLineFromParts } from '@/src/hair/domain/basket/gstInclusiveMath';
import type { BasketLine } from '@/src/hair/domain/basket/types';
import {
  computePackageRedemptionUnitDiscount,
  formatPackageRedemptionDiscountLabel,
} from '@/src/hair/domain/packages/availableServices';
import { QuickSaleDiscountPercentInput } from '@/src/hair/components/quick-sale/QuickSaleDiscountPercentInput';
import { QuickSaleStaffRow } from '@/src/hair/components/quick-sale/QuickSaleStaffFields';
import { wholeDiscountPercentFromBps } from '@/src/hair/lib/quickSaleDiscountPercent';

type Props = {
  lines: BasketLine[];
  locked?: boolean;
  staffNames?: Record<string, string>;
  preloadedStaff?: Array<{ id: string; fullName: string }>;
  onStaffNameRegistered?: (staffId: string, fullName: string) => void;
  onUpdateLine: (lineId: string, patch: Partial<BasketLine>) => void;
  onRemoveLine: (lineId: string) => void;
};

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
      <p className="py-6 text-center text-sm text-slate-500">
        Search and add items to the basket
      </p>
    );
  }

  return (
    <div className="qs-basket-scroll overflow-x-auto overflow-y-auto">
      <table className="fyh-table-compact qs-basket-table w-full min-w-[720px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            <th>Service</th>
            <th className="min-w-[9.5rem]">Staff</th>
            <th className="qs-basket-col-qty w-14 text-center">Qty</th>
            <th className="qs-basket-col-money text-right">Price</th>
            <th className="qs-basket-col-money text-right">Discount</th>
            <th className="qs-basket-col-money w-20 text-right">Final</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
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
            const retailUnitPaise = line.prepaidRedemption?.retailUnitValuePaise ?? 0;
            const prepaidRetailGross = retailUnitPaise * line.quantity;
            const prepaidDiscountPercent =
              isPrepaid && line.prepaidRedemption && retailUnitPaise > 0
                ? computePackageRedemptionUnitDiscount(
                    retailUnitPaise,
                    line.prepaidRedemption.effectiveUnitValuePaise,
                  )
                : null;
            const prepaidDiscountLabel =
              prepaidDiscountPercent != null
                ? formatPackageRedemptionDiscountLabel(prepaidDiscountPercent)
                : null;
            const prepaidDiscountPaise = Math.max(0, prepaidRetailGross);
            const discountPercent = wholeDiscountPercentFromBps(priced.discountBps);

            return (
              <tr key={line.lineId} className="align-middle">
                <td>
                  <p className="font-medium leading-tight text-slate-900">{line.snapshot.name}</p>
                  {line.snapshot.code ? (
                    <p className="text-[11px] leading-tight text-slate-500">{line.snapshot.code}</p>
                  ) : null}
                  {isPrepaid ? (
                    <p className="text-[10px] font-medium leading-tight text-cyan-700">
                      Package Redemption · Prepaid
                      {line.prepaidRedemption?.packageName
                        ? ` · ${line.prepaidRedemption.packageName}`
                        : ''}
                    </p>
                  ) : null}
                  {isPackagePurchase ? (
                    <p className="text-[10px] font-medium leading-tight text-slate-500">
                      Prepaid package sale · No staff performance
                    </p>
                  ) : null}
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
                <td className="qs-basket-col-qty text-center">
                  <Input
                    inputMode="decimal"
                    value={String(line.quantity)}
                    disabled={locked || isPrepaid}
                    onChange={(e) => {
                      const quantity = Math.max(0.001, Number(e.target.value) || 1);
                      onUpdateLine(line.lineId, { quantity });
                    }}
                    className="mx-auto h-8 w-14 text-center text-xs tabular-nums"
                    aria-label="Quantity"
                  />
                </td>
                <td className="qs-basket-col-money text-right tabular-nums text-slate-600">
                  {isPrepaid
                    ? retailUnitPaise > 0
                      ? formatInrFromPaise(prepaidRetailGross)
                      : '—'
                    : formatInrFromPaise(catalogGross)}
                </td>
                <td className="qs-basket-col-money text-right tabular-nums">
                  {isPrepaid ? (
                    prepaidDiscountLabel ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="qs-basket-discount-pct">{prepaidDiscountLabel}</span>
                        {prepaidDiscountPaise > 0 ? (
                          <span className="qs-basket-discount-amt">
                            −{formatInrFromPaise(prepaidDiscountPaise)}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      '—'
                    )
                  ) : priced.discountPaise > 0 || discountPercent > 0 ? (
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="flex items-center gap-0.5">
                        <QuickSaleDiscountPercentInput
                          lineId={line.lineId}
                          discountBps={priced.discountBps}
                          catalogGrossPaise={catalogGross}
                          disabled={locked}
                          onCommit={(overridePricePaise) =>
                            onUpdateLine(line.lineId, { overridePricePaise })
                          }
                        />
                        <span className="qs-basket-discount-pct">% off</span>
                      </div>
                      {priced.discountPaise > 0 ? (
                        <span className="qs-basket-discount-amt">
                          −{formatInrFromPaise(priced.discountPaise)}
                        </span>
                      ) : null}
                    </div>
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
                <td className="qs-basket-col-money text-right tabular-nums font-semibold text-slate-900">
                  {isPrepaid ? (
                    formatInrFromPaise(0)
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
                      className="ml-auto h-8 w-20 text-right text-xs tabular-nums font-semibold"
                      aria-label="Final amount"
                    />
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-600"
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
