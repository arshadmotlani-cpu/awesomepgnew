'use client';

import { createPortal } from 'react-dom';

const PAD = 8;

export function RoachieSpotlight({ rect }: { rect: DOMRect | null }) {
  if (!rect || typeof document === 'undefined') return null;

  const top = Math.max(0, rect.top - PAD);
  const left = Math.max(0, rect.left - PAD);
  const width = rect.width + PAD * 2;
  const height = rect.height + PAD * 2;

  return createPortal(
    <div
      className="roachie-spotlight-ring pointer-events-none"
      style={{
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
      aria-hidden
    />,
    document.body,
  );
}
