import type { ReactNode } from 'react';
import { CapitalOsLogoLockup } from '@/src/components/brand/capital-os/CapitalOsLogoLockup';
import { CapitalOsMark } from '@/src/components/brand/capital-os/CapitalOsMark';
import { CAPITAL_OS, CAPITAL_OS_BRAND } from '@/src/lib/brand/capitalOsTokens';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-ac-surface p-5 text-ac-text">
      <h2 className="mb-4 text-[11px] font-medium uppercase tracking-wide text-ac-text-muted">{title}</h2>
      {children}
    </section>
  );
}

const SIZES = [16, 32, 48, 64, 128, 512] as const;

export function CapitalOsBrandPreview() {
  return (
    <div className="ac-capital-root mx-auto max-w-6xl space-y-8 pb-12 px-4">
      <header className="space-y-2 border-b border-white/10 pb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-ac-text-muted">Finance</p>
        <h1 className="text-3xl font-semibold tracking-tight">{CAPITAL_OS.name}</h1>
        <p className="text-sm text-ac-text-secondary">
          {CAPITAL_OS.legalName} · {CAPITAL_OS.tagline}
        </p>
      </header>

      <Section title="Dual lockup">
        <CapitalOsLogoLockup markSize={40} />
      </Section>

      <Section title="Sidebar mock">
        <div className="w-60 rounded-xl border border-white/10 bg-ac-elevated p-3">
          <CapitalOsLogoLockup markSize={32} />
        </div>
      </Section>

      <Section title="Login mock">
        <div className="mx-auto max-w-sm rounded-2xl border border-white/10 bg-ac-elevated p-8 text-center">
          <CapitalOsMark size={64} className="mx-auto" />
          <p className="mt-4 text-lg font-semibold">{CAPITAL_OS.name}</p>
          <p className="text-xs uppercase tracking-widest text-ac-text-muted">{CAPITAL_OS.legalName}</p>
        </div>
      </Section>

      <Section title="Icon ladder">
        <div className="flex flex-wrap items-end gap-4">
          {SIZES.map((s) => (
            <div key={s} className="text-center">
              <CapitalOsMark size={s} />
              <p className="mt-1 text-[10px] text-ac-text-muted">{s}px</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Palette">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['Primary', CAPITAL_OS_BRAND.color.primary],
              ['Muted', CAPITAL_OS_BRAND.color.primaryMuted],
              ['Shell', CAPITAL_OS_BRAND.color.shell],
            ] as const
          ).map(([label, hex]) => (
            <div key={label} className="rounded-lg border border-white/10 p-3">
              <div className="mb-2 h-10 rounded-md" style={{ background: hex }} />
              <p className="text-xs">{label}</p>
              <p className="font-mono text-[10px] text-ac-text-muted">{hex}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="PWA">
        <p className="text-sm text-ac-text-secondary">
          Manifest: <code>/capital/manifest.webmanifest</code> · theme {CAPITAL_OS_BRAND.color.primary}
        </p>
      </Section>
    </div>
  );
}
