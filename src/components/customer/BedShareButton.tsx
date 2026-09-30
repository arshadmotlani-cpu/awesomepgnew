'use client';

import { Link2, Share2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  buildPublicBedShareUrl,
  whatsAppShareHref,
  type PublicBedShareTarget,
} from '@/src/lib/booking/publicBedShareUrl';
import { clampSharePopoverPosition } from '@/src/lib/booking/sharePopoverPosition';
import { copyBedShareLink, requestNativeBedShare } from '@/src/lib/booking/shareBedLink';

const PANEL_WIDTH = 176;
const PANEL_HEIGHT_ESTIMATE = 168;
const COPIED_DISMISS_MS = 2000;

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
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const target = { pgSlug, roomId, bedId };
  const shareText = `${roomLabel} · Bed ${bedCode}`;
  const url = currentShareUrl(target);

  useEffect(() => setMounted(true), []);

  const updatePanelPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPanelPos(
      clampSharePopoverPosition({
        triggerRect: {
          top: r.top,
          left: r.left,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        },
        panelWidth: panelRef.current?.offsetWidth ?? PANEL_WIDTH,
        panelHeight: panelRef.current?.offsetHeight ?? PANEL_HEIGHT_ESTIMATE,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    function onResize() {
      updatePanelPosition();
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: globalThis.MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  function onToggleIcon(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setCopied(false);
    setOpen((prev) => !prev);
  }

  async function onShareRow(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const shareUrl = currentShareUrl(target);
    const share =
      typeof navigator !== 'undefined' && typeof navigator.share === 'function'
        ? (data: { url: string; title: string; text: string }) => navigator.share(data)
        : undefined;
    const outcome = await requestNativeBedShare(
      { url: shareUrl, title: `Bed ${bedCode}`, text: shareText },
      share,
    );
    if (outcome === 'shared') setOpen(false);
  }

  async function onCopyRow(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const shareUrl = currentShareUrl(target);
    const writeText =
      typeof navigator !== 'undefined' && navigator.clipboard?.writeText
        ? (value: string) => navigator.clipboard.writeText(value)
        : async () => {
            throw new Error('clipboard unavailable');
          };
    const ok = await copyBedShareLink(shareUrl, writeText);
    if (ok) {
      setCopied(true);
      setOpen(false);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), COPIED_DISMISS_MS);
    }
  }

  function onWhatsAppRow(event: MouseEvent) {
    event.stopPropagation();
    setOpen(false);
  }

  const popover =
    open && mounted ? (
      <div
        ref={panelRef}
        role="dialog"
        aria-label={`Share bed ${bedCode}`}
        className="fixed z-[100] w-44 rounded-2xl border border-white/15 bg-[#1c1c1e] p-2 text-left shadow-xl"
        style={{ top: panelPos.top, left: panelPos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-white/60">
          Bed {bedCode}
        </p>
        <button
          type="button"
          onClick={onShareRow}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-apg-orange"
        >
          <Share2 className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          Share
        </button>
        <button
          type="button"
          onClick={onCopyRow}
          aria-label={`Copy Bed ${bedCode} booking link`}
          className="mt-0.5 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-apg-orange"
        >
          <Link2 className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          Copy link
        </button>
        <a
          href={whatsAppShareHref(url, shareText)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onWhatsAppRow}
          className="mt-0.5 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-apg-orange"
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-xs font-bold text-[#25D366]" aria-hidden>
            W
          </span>
          WhatsApp
        </a>
      </div>
    ) : null;

  return (
    <div className={className} onClick={(event) => event.stopPropagation()}>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={onToggleIcon}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`Share Bed ${bedCode} booking link`}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-sm backdrop-blur-sm hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-apg-orange"
        >
          <Link2 className="h-4 w-4" aria-hidden />
        </button>
        {copied && !open ? (
          <span
            role="status"
            className="pointer-events-none absolute right-0 top-11 z-[100] whitespace-nowrap rounded-lg bg-[#1c1c1e] px-2.5 py-1 text-xs font-medium text-emerald-300 shadow-lg"
          >
            Link copied
          </span>
        ) : null}
      </div>
      {mounted && popover ? createPortal(popover, document.body) : null}
    </div>
  );
}
