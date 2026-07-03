'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';

type Props = {
  printHref: string;
  shareUrl: string;
  whatsAppAction?: (formData: FormData) => void;
  whatsAppPending?: boolean;
  backHref: string;
  backLabel: string;
};

export function FinancialDocumentToolbar({
  printHref,
  shareUrl,
  whatsAppAction,
  whatsAppPending = false,
  backHref,
  backLabel,
}: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
    }
  }, [shareUrl]);

  return (
    <div className="flex flex-wrap gap-2">
      {whatsAppAction ? (
        <form action={whatsAppAction}>
          <button
            type="submit"
            disabled={whatsAppPending}
            className="rounded-lg bg-[#25D366] px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {whatsAppPending ? 'Opening…' : 'WhatsApp'}
          </button>
        </form>
      ) : null}
      <Link
        href={printHref}
        target="_blank"
        className="rounded-lg border border-white/10 px-3 py-2 text-sm text-apg-silver hover:text-white"
      >
        Print
      </Link>
      <Link
        href={printHref}
        target="_blank"
        className="rounded-lg border border-white/10 px-3 py-2 text-sm text-apg-silver hover:text-white"
      >
        Download PDF
      </Link>
      <button
        type="button"
        onClick={() => void copyLink()}
        className="rounded-lg border border-white/10 px-3 py-2 text-sm text-apg-silver hover:text-white"
      >
        {copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Copy failed' : 'Copy link'}
      </button>
      <Link
        href={backHref}
        className="rounded-lg border border-white/10 px-3 py-2 text-sm text-apg-silver hover:text-white"
      >
        {backLabel}
      </Link>
    </div>
  );
}
