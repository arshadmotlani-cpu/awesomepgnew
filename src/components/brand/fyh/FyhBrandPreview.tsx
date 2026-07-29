import type { ReactNode } from 'react';
import { FyhLoginBrandHeader } from '@/src/components/brand/fyh/FyhLoginBrandHeader';
import { FyhMark } from '@/src/components/brand/fyh/FyhMark';
import { FyhSidebarBrand } from '@/src/components/brand/fyh/FyhSidebarBrand';
import { FYH_BRAND, FYH_ERP } from '@/src/lib/brand/fyhBrandTokens';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="fyh-glass p-5">
      <h2 className="mb-4 text-[11px] font-medium uppercase tracking-wide text-fyh-text-muted">{title}</h2>
      {children}
    </section>
  );
}

export function FyhBrandPreview() {
  return (
    <div className="fyh-root fyh-forest-bg mx-auto max-w-6xl space-y-8 px-4 pb-12">
      <header className="space-y-2 border-b border-[color:var(--fyh-border)] pb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-fyh-accent">Salon ERP</p>
        <h1 className="fyh-display text-3xl font-semibold">{FYH_ERP.name}</h1>
        <p className="text-sm text-fyh-text-secondary">
          Purple mark + PWA · in-app UI remains forest/gold
        </p>
      </header>

      <Section title="Mark (purple)">
        <FyhMark size={128} />
      </Section>

      <Section title="Sidebar mock">
        <div className="w-64 overflow-hidden rounded-xl border border-[color:var(--fyh-border)]">
          <FyhSidebarBrand />
        </div>
      </Section>

      <Section title="Login mock">
        <div className="fyh-glass max-w-md p-8">
          <FyhLoginBrandHeader />
        </div>
      </Section>

      <Section title="Brand palette (mark only)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(
            [
              ['Primary', FYH_BRAND.mark.primary],
              ['Soft', FYH_BRAND.mark.primarySoft],
              ['On mark', FYH_BRAND.mark.onMark],
            ] as const
          ).map(([label, hex]) => (
            <div key={label} className="rounded-lg border border-[color:var(--fyh-border)] p-3">
              <div className="mb-2 h-10 rounded-md" style={{ background: hex }} />
              <p className="text-xs text-fyh-text-secondary">{label}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="PWA">
        <p className="text-sm text-fyh-text-secondary">
          Manifest: <code>/fyh/manifest.webmanifest</code> · theme {FYH_BRAND.mark.primary}
        </p>
      </Section>
    </div>
  );
}
