'use client';

import { useState } from 'react';
import { ApgCard } from '@/src/components/customer/design-system';
import { RentInvoicePromoField } from '@/src/components/customer/CouponCodeField';
import { ResidentPayRentClient } from '@/src/components/customer/account/resident/ResidentPayRentClient';
import { paiseToInr } from '@/src/lib/format';

type Props = {
  invoiceId: string;
  customerId: string;
  rentPaise: number;
  initialDiscountPaise: number;
  initialPromoCode: string | null;
  initialOutstandingPaise: number;
  lateFeePaise: number;
  periodLabel: string;
  confirmMessageBase: string;
  qrImageUrl?: string | null;
  upiId?: string | null;
  existingProofUrl?: string | null;
  rejectionReason?: string | null;
  rejectionMessage?: string | null;
  uploadScreenshot: (formData: FormData) => Promise<string>;
  backHref: string;
};

export function ResidentPayRentWithPromo(props: Props) {
  const [discountPaise, setDiscountPaise] = useState(props.initialDiscountPaise);
  const [outstandingPaise, setOutstandingPaise] = useState(props.initialOutstandingPaise);
  const [promoCode, setPromoCode] = useState<string | null>(props.initialPromoCode);

  const amountLabel = paiseToInr(outstandingPaise + props.lateFeePaise);
  const confirmMessage = `You are paying ${amountLabel} for rent for ${props.periodLabel}. Pay the exact amount via UPI, then upload your payment screenshot for verification.`;

  return (
    <>
      <ApgCard tier="account" className="p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Amount summary</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">Original rent</dt>
            <dd className="tabular-nums font-medium text-zinc-900">{paiseToInr(props.rentPaise)}</dd>
          </div>
          {discountPaise > 0 ? (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-600">
                  Discount{promoCode ? ` (${promoCode})` : ''}
                </dt>
                <dd className="tabular-nums font-medium text-emerald-700">
                  −{paiseToInr(discountPaise)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-zinc-100 pt-2">
                <dt className="font-semibold text-zinc-900">Rent after discount</dt>
                <dd className="tabular-nums font-semibold text-zinc-900">
                  {paiseToInr(props.rentPaise - discountPaise)}
                </dd>
              </div>
            </>
          ) : null}
          {props.lateFeePaise > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-600">Late fee</dt>
              <dd className="tabular-nums font-medium text-rose-700">
                {paiseToInr(props.lateFeePaise)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 border-t border-zinc-200 pt-2">
            <dt className="font-semibold text-zinc-900">Total to pay</dt>
            <dd className="tabular-nums text-lg font-bold text-[#FF5A1F]">{amountLabel}</dd>
          </div>
        </dl>
      </ApgCard>

      <RentInvoicePromoField
        invoiceId={props.invoiceId}
        rentPaise={props.rentPaise}
        initialPromoCode={props.initialPromoCode}
        initialDiscountPaise={props.initialDiscountPaise}
        customerId={props.customerId}
        variant="light"
        onTotalsChange={({ discountPaise: d, outstandingPaise: o, promoCode: c }) => {
          setDiscountPaise(d);
          setOutstandingPaise(o);
          setPromoCode(c);
        }}
      />

      <ResidentPayRentClient
        invoiceId={props.invoiceId}
        amountLabel={amountLabel}
        confirmMessage={confirmMessage}
        qrImageUrl={props.qrImageUrl}
        upiId={props.upiId}
        existingProofUrl={props.existingProofUrl}
        rejectionReason={props.rejectionReason}
        rejectionMessage={props.rejectionMessage}
        uploadScreenshot={props.uploadScreenshot}
        backHref={props.backHref}
      />
    </>
  );
}
