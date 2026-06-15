'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BillingWhatsAppWithLinkButton } from '@/src/components/admin/BillingWhatsAppWithLinkButton';
import { AdminKycWhatsAppButton, WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { buildKycWhatsAppUrl, clientPublicSiteBaseUrl } from '@/src/lib/kyc/adminWhatsApp';
import { paiseToInr, titleCase } from '@/src/lib/format';
import type { DepositCollectionStatus } from '@/src/db/schema/enums';
import { labelDepositCollectionStatus } from '@/src/lib/depositCollectionLabels';

const BTN =
  'inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-apg-silver hover:text-white';

type ResidentActionBarProps = {
  customerId: string;
  customerName: string;
  phone: string;
  kycStatus: 'pending' | 'approved' | 'rejected';
  pgId?: string;
  pgName?: string;
  roomNumber?: string;
  bookingId?: string;
  monthlyRentPaise?: number;
  pendingRentPaise?: number;
  rentDueDate?: string;
  rentOverdue?: boolean;
  depositDuePaise?: number;
  depositCollectionStatus?: string;
  depositRefundablePaise?: number;
  pendingElectricityPaise?: number;
  electricityBasePaise?: number;
  electricityDueDate?: string;
  electricityOverdue?: boolean;
  electricityInvoiceNumber?: string;
};

function ActionRow({
  label,
  amount,
  status,
  editHref,
  editLabel,
  children,
}: {
  label: string;
  amount: string;
  status?: React.ReactNode;
  editHref?: string;
  editLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 py-3 last:border-0">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">{label}</p>
        <p className="text-sm font-semibold text-white">{amount}</p>
        {status ? <div className="mt-0.5">{status}</div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {editHref ? (
          <Link href={editHref} className={BTN}>
            {editLabel ?? 'Edit'}
          </Link>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function ResidentActionBar(props: ResidentActionBarProps) {
  const [elecAmountInr, setElecAmountInr] = useState(() =>
    Math.max(0, Math.round((props.pendingElectricityPaise ?? 0) / 100)),
  );

  useEffect(() => {
    setElecAmountInr(Math.max(0, Math.round((props.pendingElectricityPaise ?? 0) / 100)));
  }, [props.pendingElectricityPaise]);

  const rentAmountPaise = props.pendingRentPaise ?? props.monthlyRentPaise ?? 0;
  const depositBillPaise = props.depositDuePaise ?? 0;
  const elecAmountPaise = Math.round(elecAmountInr * 100);
  const canBill = Boolean(props.pgId && props.pgName);

  const kycWhatsAppHref =
    buildKycWhatsAppUrl({
      phone: props.phone,
      customerName: props.customerName,
      baseUrl: clientPublicSiteBaseUrl(),
    }) ?? undefined;

  return (
    <div className="rounded-2xl border border-[#FF5A1F]/30 bg-[#1A1F27] p-4 ring-1 ring-[#FF5A1F]/10">
      <p className="text-xs font-semibold uppercase tracking-wide text-apg-orange">
        Resident actions
      </p>
      <p className="mt-1 text-[11px] text-apg-silver">
        WhatsApp opens with the payment link included — no separate link step.
      </p>

      <div className="mt-2">
        <ActionRow
          label="KYC"
          amount={titleCase(props.kycStatus)}
          status={<Badge tone={toneForStatus(props.kycStatus)}>{titleCase(props.kycStatus)}</Badge>}
          editHref={props.bookingId ? `/admin/kyc?customer=${props.customerId}` : undefined}
          editLabel="Review"
        >
          {kycWhatsAppHref ? (
            <a
              href={kycWhatsAppHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`${BTN} border-[#25D366]/40 bg-[#25D366]/10 text-[#25D366]`}
            >
              <WhatsAppIcon className="h-3.5 w-3.5" />
              WhatsApp
            </a>
          ) : (
            <AdminKycWhatsAppButton
              phone={props.phone}
              customerName={props.customerName}
              className="!h-auto !w-auto !rounded-lg !px-2.5 !py-1.5"
            />
          )}
        </ActionRow>

        <ActionRow
          label="Rent"
          amount={canBill && rentAmountPaise > 0 ? paiseToInr(rentAmountPaise) : '—'}
          status={
            props.rentOverdue ? (
              <span className="text-[10px] text-rose-300">Overdue</span>
            ) : props.pendingRentPaise ? (
              <span className="text-[10px] text-amber-200">Pending invoice</span>
            ) : null
          }
          editHref="#edit-tenancy"
          editLabel="Edit"
        >
          {canBill && rentAmountPaise > 0 ? (
            <BillingWhatsAppWithLinkButton
              kind="rent"
              residentId={props.customerId}
              pgId={props.pgId!}
              customerName={props.customerName}
              phone={props.phone}
              pgName={props.pgName!}
              amountPaise={rentAmountPaise}
              dueDate={props.rentDueDate ?? 'soon'}
              roomNumber={props.roomNumber}
              isOverdue={props.rentOverdue}
            />
          ) : null}
        </ActionRow>

        <ActionRow
          label="Deposit"
          amount={
            depositBillPaise > 0
              ? `${paiseToInr(depositBillPaise)} due`
              : props.depositRefundablePaise
                ? `${paiseToInr(props.depositRefundablePaise)} held`
                : '—'
          }
          status={
            props.depositCollectionStatus ? (
              <span className="text-[10px] text-apg-silver">
                {labelDepositCollectionStatus(props.depositCollectionStatus as DepositCollectionStatus)}
              </span>
            ) : null
          }
          editHref={props.bookingId ? `/admin/deposits/${props.bookingId}` : undefined}
        >
          {canBill && depositBillPaise > 0 ? (
            <BillingWhatsAppWithLinkButton
              kind="deposit"
              residentId={props.customerId}
              pgId={props.pgId!}
              customerName={props.customerName}
              phone={props.phone}
              pgName={props.pgName!}
              amountPaise={depositBillPaise}
              dueDate="soon"
              roomNumber={props.roomNumber}
            />
          ) : null}
        </ActionRow>

        <ActionRow
          label="Electricity"
          amount={elecAmountPaise > 0 ? paiseToInr(elecAmountPaise) : '—'}
          status={
            <>
              {props.electricityOverdue ? (
                <span className="text-[10px] text-rose-300">Overdue</span>
              ) : props.pendingElectricityPaise ? (
                <span className="text-[10px] text-amber-200">
                  From generated bill
                  {props.electricityInvoiceNumber ? ` · ${props.electricityInvoiceNumber}` : ''}
                </span>
              ) : null}
            </>
          }
          editHref={
            props.bookingId
              ? `/admin/collections?tab=electricity`
              : '/admin/electricity/new'
          }
          editLabel={props.pendingElectricityPaise ? 'View bill' : 'Create bill'}
        >
          {canBill && (props.pendingElectricityPaise ?? 0) > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-[10px] text-apg-silver">
                ₹
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={elecAmountInr}
                  onChange={(e) => {
                    setElecAmountInr(Math.max(0, Number(e.target.value) || 0));
                  }}
                  className="w-20 rounded border border-white/10 bg-[#12161C] px-2 py-1 text-xs text-white"
                  title={
                    props.electricityBasePaise
                      ? `Bill share ${paiseToInr(props.electricityBasePaise)} — edit if needed`
                      : 'Amount to collect'
                  }
                />
              </label>
              <BillingWhatsAppWithLinkButton
                kind="electricity"
                residentId={props.customerId}
                pgId={props.pgId!}
                customerName={props.customerName}
                phone={props.phone}
                pgName={props.pgName!}
                amountPaise={elecAmountPaise}
                dueDate={props.electricityDueDate ?? 'soon'}
                roomNumber={props.roomNumber}
                isOverdue={props.electricityOverdue}
              />
            </div>
          ) : canBill ? (
            <Link href="/admin/electricity/new" className={BTN}>
              Generate bill
            </Link>
          ) : null}
        </ActionRow>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
        {props.bookingId ? (
          <Link href={`/admin/bookings/${props.bookingId}`} className={BTN}>
            History →
          </Link>
        ) : null}
        <Link href="/admin/invoices" className={BTN}>
          Invoices →
        </Link>
      </div>
    </div>
  );
}
