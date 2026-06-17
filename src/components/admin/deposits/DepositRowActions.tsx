'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BillingWhatsAppWithLinkButton } from '@/src/components/admin/BillingWhatsAppWithLinkButton';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import type { DepositTableRow } from '@/src/components/admin/deposits/types';

const BTN =
  'inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[11px] font-medium text-apg-silver hover:border-white/20 hover:text-white';

function whatsAppAmount(row: DepositTableRow): number {
  if (row.depositDuePaise > 0) return row.depositDuePaise;
  if (row.refundableBalancePaise > 0) return row.refundableBalancePaise;
  return row.depositPaise;
}

export function DepositRowActions({
  row,
  onOpen,
  compact,
}: {
  row: DepositTableRow;
  onOpen?: () => void;
  compact?: boolean;
}) {
  const amount = whatsAppAmount(row);
  const canWhatsApp = amount > 0;

  const openBtn = onOpen ? (
    <button type="button" onClick={onOpen} className={`${BTN} text-[#FF5A1F]`}>
      Open →
    </button>
  ) : (
    <Link href={`/admin/deposits/${row.bookingId}`} className={`${BTN} text-[#FF5A1F]`}>
      Open →
    </Link>
  );

  const historyBtn = (
    <Link href={`/admin/bookings/${row.bookingId}`} className={BTN}>
      History
    </Link>
  );

  const whatsAppBtn = canWhatsApp ? (
    <BillingWhatsAppWithLinkButton
      kind="deposit"
      residentId={row.customerId}
      pgId={row.pgId}
      customerName={row.customerFullName}
      phone={row.customerPhone}
      pgName={row.pgName}
      amountPaise={amount}
      dueDate="soon"
      roomNumber={row.roomNumber}
    />
  ) : (
    <span
      className={`${BTN} cursor-not-allowed opacity-40`}
      title="No outstanding deposit amount for WhatsApp reminder"
    >
      <WhatsAppIcon className="h-3 w-3" />
      WhatsApp
    </span>
  );

  if (compact) {
    return (
      <DepositActionsMenu
        items={[
          { key: 'open', node: openBtn },
          { key: 'wa', node: whatsAppBtn },
          { key: 'hist', node: historyBtn },
        ]}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {openBtn}
      {whatsAppBtn}
      {historyBtn}
    </div>
  );
}

function DepositActionsMenu({ items }: { items: Array<{ key: string; node: ReactNode }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`${BTN} min-w-[2.5rem] justify-center`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        ⋯ More
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 flex min-w-[10rem] flex-col gap-1 rounded-lg border border-white/10 bg-[#1A1F27] p-2 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <div key={item.key} role="none" className="[&_a]:w-full [&_button]:w-full">
              {item.node}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
