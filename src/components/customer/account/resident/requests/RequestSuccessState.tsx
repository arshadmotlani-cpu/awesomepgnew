import Link from 'next/link';
import { StatusChip } from '@/src/components/customer/design-system';

export function RequestSuccessState({
  title,
  requestId,
  statusLabel,
  nextStep,
  primaryHref,
  primaryLabel,
  whatsappHref,
}: {
  title: string;
  requestId?: string;
  statusLabel: string;
  nextStep: string;
  primaryHref: string;
  primaryLabel: string;
  whatsappHref?: string;
}) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={statusLabel.toLowerCase().replace(/\s+/g, '_')} />
        <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
      </div>
      {requestId ? (
        <p className="mt-2 font-mono text-xs text-zinc-600">Reference: {requestId.slice(0, 8)}…</p>
      ) : null}
      <p className="mt-3 text-sm text-zinc-700">{nextStep}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {whatsappHref ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            Open WhatsApp
          </a>
        ) : null}
        <Link
          href={primaryHref}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          {primaryLabel}
        </Link>
      </div>
    </div>
  );
}
