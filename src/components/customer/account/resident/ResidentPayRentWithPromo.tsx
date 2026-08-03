'use client';

import { useState } from 'react';
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
  rejectedAt?: Date | string | null;
  backHref: string;
};

export function ResidentPayRentWithPromo(props: Props) {
  const [outstandingPaise, setOutstandingPaise] = useState(props.initialOutstandingPaise);

  const amountLabel = paiseToInr(outstandingPaise + props.lateFeePaise);
  const confirmMessage = `You are paying ${amountLabel} for rent for ${props.periodLabel}. Pay the exact amount via UPI, then upload your payment screenshot for verification.`;

  return (
    <>
      <RentInvoicePromoField
        invoiceId={props.invoiceId}
        rentPaise={props.rentPaise}
        initialPromoCode={props.initialPromoCode}
        initialDiscountPaise={props.initialDiscountPaise}
        customerId={props.customerId}
        variant="light"
        onTotalsChange={({ outstandingPaise: o }) => {
          setOutstandingPaise(o);
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
        rejectedAt={props.rejectedAt}
        backHref={props.backHref}
        residentId={props.customerId}
      />
    </>
  );
}
