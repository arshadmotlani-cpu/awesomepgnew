'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { generatePaymentLinkAction } from '@/app/(admin)/admin/residents/paymentActions';
import { AdminBillingWhatsAppButton } from '@/src/components/admin/AdminBillingWhatsAppButton';
import { AdminKycWhatsAppButton, WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { buildKycWhatsAppUrl, clientPublicSiteBaseUrl } from '@/src/lib/kyc/adminWhatsApp';
import { paiseToInr, titleCase } from '@/src/lib/format';
import type { DepositCollectionStatus } from '@/src/db/schema/enums';
import { labelDepositCollectionStatus } from '@/src/lib/depositCollectionLabels';

const BTN =
  'inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-apg-silver hover:text-white';

type BillingLinkState = { publicUrl: string; whatsappShareUrl: string | null } | null;

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
  electricityDueDate?: string;
  electricityOverdue?: boolean;
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
  const [pending, startTransition] = useTransition();
  const [rentLink, setRentLink] = useState<BillingLinkState>(null);
  const [depositLink, setDepositLink] = useState<BillingLinkState>(null);
  const [elecLink, setElecLink] = useState<BillingLinkState>(null);
  const [error, setError] = useState<string | null>(null);

  const rentAmountPaise = props.pendingRentPaise ?? props.monthlyRentPaise ?? 0;
  const depositBillPaise = props.depositDuePaise ?? 0;
  const elecAmountPaise = props.pendingElectricityPaise ?? 0;
  const canBill = Boolean(props.pgId && props.pgName);

  const kycWhatsAppHref =
    buildKycWhatsAppUrl({
      phone: props.phone,
      customerName: props.customerName,
      baseUrl: clientPublicSiteBaseUrl(),
    }) ?? undefined;

  function generateLink(
    purpose: 'rent' | 'deposit' | 'electricity',
    amountPaise: number,
    extra?: { dueDate?: string; isOverdue?: boolean },
  ) {
    if (!props.pgId || !props.pgName || amountPaise <= 0) return;
    startTransition(async () => {
      setError(null);
      const fd = new FormData();
      fd.set('residentId', props.customerId);
      fd.set('pgId', props.pgId!);
      fd.set('pgName', props.pgName!);
      fd.set('residentName', props.customerName);
      fd.set('residentPhone', props.phone);
      fd.set('amountPaise', String(amountPaise));
      fd.set('purpose', purpose);
      if (props.roomNumber) fd.set('roomNumber', props.roomNumber);
      if (extra?.dueDate) fd.set('dueDate', extra.dueDate);
      if (extra?.isOverdue) fd.set('isOverdue', '1');

      const res = await generatePaymentLinkAction(fd);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      const payload = { publicUrl: res.publicUrl, whatsappShareUrl: res.whatsappShareUrl };
      if (purpose === 'rent') setRentLink(payload);
      if (purpose === 'deposit') setDepositLink(payload);
      if (purpose === 'electricity') setElecLink(payload);
    });
  }

  return (
    <div className="rounded-2xl border border-[#FF5A1F]/30 bg-[#1A1F27] p-4 ring-1 ring-[#FF5A1F]/10">
      <p className="text-xs font-semibold uppercase tracking-wide text-apg-orange">
        Resident actions
      </p>
      <p className="mt-1 text-[11px] text-apg-silver">
        WhatsApp and payment links always use current amounts below.
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
            <>
              <AdminBillingWhatsAppButton
                kind="rent"
                customerName={props.customerName}
                phone={props.phone}
                pgName={props.pgName!}
                amountPaise={rentAmountPaise}
                dueDate={props.rentDueDate ?? 'soon'}
                roomNumber={props.roomNumber}
                isOverdue={props.rentOverdue}
                paymentLinkUrl={rentLink?.publicUrl}
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  generateLink('rent', rentAmountPaise, {
                    dueDate: props.rentDueDate,
                    isOverdue: props.rentOverdue,
                  })
                }
                className={`${BTN} border-[#FF5A1F]/40 text-[#FF5A1F]`}
              >
                Link
              </button>
            </>
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
            <>
              <AdminBillingWhatsAppButton
                kind="deposit"
                customerName={props.customerName}
                phone={props.phone}
                pgName={props.pgName!}
                amountPaise={depositBillPaise}
                dueDate="soon"
                roomNumber={props.roomNumber}
                paymentLinkUrl={depositLink?.publicUrl}
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => generateLink('deposit', depositBillPaise)}
                className={`${BTN} border-[#FF5A1F]/40 text-[#FF5A1F]`}
              >
                Link
              </button>
            </>
          ) : null}
        </ActionRow>

        <ActionRow
          label="Electricity"
          amount={elecAmountPaise > 0 ? paiseToInr(elecAmountPaise) : '—'}
          status={
            props.electricityOverdue ? (
              <span className="text-[10px] text-rose-300">Overdue</span>
            ) : null
          }
          editHref={props.bookingId ? `/admin/electricity?booking=${props.bookingId}` : '/admin/electricity'}
        >
          {canBill && elecAmountPaise > 0 ? (
            <>
              <AdminBillingWhatsAppButton
                kind="electricity"
                customerName={props.customerName}
                phone={props.phone}
                pgName={props.pgName!}
                amountPaise={elecAmountPaise}
                dueDate={props.electricityDueDate ?? 'soon'}
                roomNumber={props.roomNumber}
                isOverdue={props.electricityOverdue}
                paymentLinkUrl={elecLink?.publicUrl}
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  generateLink('electricity', elecAmountPaise, {
                    dueDate: props.electricityDueDate,
                    isOverdue: props.electricityOverdue,
                  })
                }
                className={`${BTN} border-[#FF5A1F]/40 text-[#FF5A1F]`}
              >
                Link
              </button>
            </>
          ) : null}
        </ActionRow>
      </div>

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
        {props.bookingId ? (
          <Link href={`/admin/bookings/${props.bookingId}`} className={BTN}>
            History →
          </Link>
        ) : null}
        <Link href="/admin/panel?tab=audit" className={BTN}>
          Rent audit →
        </Link>
        <Link href="/admin/panel?tab=links" className={BTN}>
          All links →
        </Link>
      </div>
    </div>
  );
}
