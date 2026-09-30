'use client';

import { Link2 } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import {
  buildPublicBedShareUrl,
  whatsAppShareHref,
  type PublicBedShareTarget,
} from '@/src/lib/booking/publicBedShareUrl';
import { copyBedShareLink, requestNativeBedShare } from '@/src/lib/booking/shareBedLink';

type Props = PublicBedShareTarget & {
  bedCode: string;
  roomLabel: string;
  className?: string;
};

function currentShareUrl(target: PublicBedShareTarget): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return buildPublicBedShareUrl(target, origin);
}

export function BedShareButton({
  pgSlug,
  roomId,
  bedId,
  bedCode,
  roomLabel,
  className = '',
}: Props) {
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const target = { pgSlug, roomId, bedId };
  const shareText = `${roomLabel} · Bed ${bedCode}`;

  async function onShare(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setCopied(false);
    const url = currentShareUrl(target);
    const share =
      typeof navigator !== 'undefined' && typeof navigator.share === 'function'
        ? (data: { url: string; title: string; text: string }) => navigator.share(data)
        : undefined;
    const outcome = await requestNativeBedShare(
      { url, title: `Bed ${bedCode}`, text: shareText },
      share,
    );
    if (outcome === 'fallback') setFallbackOpen(true);
  }

  async function onCopy(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const url = currentShareUrl(target);
    const writeText =
      typeof navigator !== 'undefined' && navigator.clipboard?.writeText
        ? (value: string) => navigator.clipboard.writeText(value)
        : async () => {
            throw new Error('clipboard unavailable');
          };
    const ok = await copyBedShareLink(url, writeText);
    if (ok) setCopied(true);
  }

  const url = currentShareUrl(target);

  return (
    <div className={className} onClick={(event) => event.stopPropagation()}>
      <div className="relative">
      <button
        type="button"
        onClick={onShare}
        aria-label={`Share link for bed ${bedCode}`}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-sm backdrop-blur-sm hover:bg-black/70"
      >
        <Link2 className="h-4 w-4" aria-hidden />
      </button>
      {fallbackOpen ? (
        <div
          role="dialog"
          aria-label="Share this bed"
          className="absolute right-0 top-11 z-30 w-44 rounded-2xl border border-white/15 bg-[#1c1c1e] p-2 text-left shadow-xl"
        >
          <button
            type="button"
            onClick={onCopy}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/10"
          >
            Copy link
          </button>
          <a
            href={whatsAppShareHref(url, shareText)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block rounded-xl px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
            onClick={(event) => event.stopPropagation()}
          >
            WhatsApp
          </a>
          {copied ? (
            <p className="px-3 py-1.5 text-xs font-medium text-emerald-300">Link copied</p>
          ) : null}
        </div>
      ) : null}
      </div>
    </div>
  );
}
