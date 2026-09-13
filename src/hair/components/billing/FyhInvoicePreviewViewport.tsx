'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  /** When true, scale to fit both width and height (one-page POS preview). When false, fit width only. */
  fitHeight?: boolean;
};

/**
 * Scales embedded .fyh-invoice-sheet to fit the preview pane (transform, not font changes).
 * Print/PDF paths are unchanged — this wrapper is screen-only.
 */
export function FyhInvoicePreviewViewport({ children, className, fitHeight = true }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ scale: 1, width: 0, height: 0 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const measureRoot = measureRef.current;
    if (!viewport || !measureRoot) return;

    const measure = () => {
      const sheet =
        measureRoot.querySelector<HTMLElement>('.fyh-invoice-sheet') ??
        (measureRoot.firstElementChild as HTMLElement | null);
      if (!sheet) return;

      const naturalWidth = sheet.offsetWidth;
      const naturalHeight = sheet.offsetHeight;
      if (naturalWidth <= 0 || naturalHeight <= 0) return;

      const pad = 12;
      const availW = Math.max(0, viewport.clientWidth - pad);
      const availH = Math.max(0, viewport.clientHeight - pad);
      const scaleW = Math.min(availW / naturalWidth, 1);
      let scale = scaleW;
      if (fitHeight) {
        const heightAtWidth = naturalHeight * scaleW;
        if (heightAtWidth <= availH) {
          const scaleH = availH / naturalHeight;
          scale = Math.min(scaleW, scaleH, 1);
        } else {
          scale = scaleW;
        }
      }

      setLayout({
        scale,
        width: naturalWidth * scale,
        height: naturalHeight * scale,
      });
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(viewport);
    ro.observe(measureRoot);
    return () => ro.disconnect();
  }, [children, fitHeight]);

  return (
    <div
      ref={viewportRef}
      className={className ?? 'fyh-invoice-preview-viewport'}
      data-invoice-preview-scale={layout.scale < 1 ? 'fit' : 'natural'}
    >
      <div
        className="fyh-invoice-preview-stage"
        style={{
          width: layout.width > 0 ? layout.width : undefined,
          height: layout.height > 0 ? layout.height : undefined,
          margin: '0 auto',
        }}
      >
        <div
          ref={measureRef}
          className="fyh-invoice-preview-measure"
          style={{
            transform: `scale(${layout.scale})`,
            transformOrigin: 'top left',
            width: layout.scale < 1 && layout.width > 0 ? layout.width / layout.scale : undefined,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
