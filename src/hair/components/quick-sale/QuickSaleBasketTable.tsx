'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';
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
      <div className="qs-compact-basket-empty">
        <p className="font-medium text-slate-600">No items yet</p>
        <p className="text-xs text-slate-400">
          Search for a service, product or package to add it.
        </p>
      </div>
    );
  }

  return (
    <div className="qs-basket-scroll">
      <table className="qs-compact-basket-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Staff</th>
            <th className="text-center">Qty</th>
            <th className="text-right">Price</th>
            <th className="text-right">Discount</th>
            <th className="text-right">Final</th>
            <th className="text-center">Action</th>
          </tr>
        </thead>
        <tbody>
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
              <tr key={line.lineId}>
                <td>
                  <p className="qs-compact-line-name">{line.snapshot.name}</p>
                  {line.snapshot.code ? (
                    <p className="qs-compact-line-meta">{line.snapshot.code}</p>
                  ) : null}
                  {isPrepaid ? (
                    <p className="qs-compact-line-meta qs-compact-line-prepaid">
                      Package Redemption · Prepaid
                      {line.prepaidRedemption?.packageName
                        ? ` · ${line.prepaidRedemption.packageName}`
                        : ''}
                    </p>
                  ) : null}
                  {isPackagePurchase ? (
                    <p className="qs-compact-line-meta">Prepaid package sale</p>
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
                <td className="text-center">
                  <div className="qs-compact-qty">
                    <button
                      type="button"
                      className="qs-compact-qty-btn"
                      disabled={locked || isPrepaid || line.quantity <= 1}
                      onClick={() =>
                        onUpdateLine(line.lineId, {
                          quantity: Math.max(1, line.quantity - 1),
                        })
                      }
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-2.5 w-2.5" />
                    </button>
                    <span className="qs-compact-qty-val tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      className="qs-compact-qty-btn"
                      disabled={locked || isPrepaid}
                      onClick={() => onUpdateLine(line.lineId, { quantity: line.quantity + 1 })}
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </td>
                <td className="text-right tabular-nums">
                  {isPrepaid
                    ? retailUnitPaise > 0
                      ? formatInrFromPaise(prepaidRetailGross)
                      : '—'
                    : formatInrFromPaise(catalogGross)}
                </td>
                <td className="text-right tabular-nums">
                  {isPrepaid ? (
                    prepaidDiscountLabel ? (
                      <div className="qs-compact-discount-col">
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
                  ) : (
                    <div className="qs-compact-discount-col">
                      <div className="flex items-center justify-end gap-0.5">
                        <QuickSaleDiscountPercentInput
                          lineId={line.lineId}
                          discountBps={priced.discountBps}
                          catalogGrossPaise={catalogGross}
                          disabled={locked}
                          onCommit={(overridePricePaise) =>
                            onUpdateLine(line.lineId, { overridePricePaise })
                          }
                        />
                        {discountPercent > 0 ? (
                          <span className="qs-basket-discount-pct text-[10px]">%</span>
                        ) : null}
                      </div>
                      {priced.discountPaise > 0 ? (
                        <span className="qs-basket-discount-amt">
                          −{formatInrFromPaise(priced.discountPaise)}
                        </span>
                      ) : null}
                    </div>
                  )}
                </td>
                <td className="text-right tabular-nums font-semibold">
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
                        onUpdateLine(line.lineId, {
                          overridePricePaise: Math.round(Math.max(0, rupees) * 100),
                        });
                      }}
                      className="qs-compact-final-input"
                      aria-label="Final amount"
                    />
                  )}
                </td>
                <td className="text-center">
                  <button
                    type="button"
                    className="qs-compact-remove-btn"
                    disabled={locked}
                    onClick={() => onRemoveLine(line.lineId)}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-3 w-3" />
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
