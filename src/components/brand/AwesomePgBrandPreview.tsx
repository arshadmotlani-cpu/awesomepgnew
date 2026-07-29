import type { ReactNode } from 'react';
import { AwesomePgMark } from '@/src/components/brand/AwesomePgMark';
import { AwesomePgLogo } from '@/src/components/brand/AwesomePgLogo';
import { AWESOME_PG, AWESOME_PG_BRAND } from '@/src/lib/brand/awesomePgTokens';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-apg-deep p-5">
      <h2 className="mb-4 text-[11px] font-medium uppercase tracking-wide text-apg-silver">{title}</h2>
      {children}
    </section>
  );
}

const SIZES = [16, 32, 48, 64, 128, 512] as const;

export function AwesomePgBrandPreview() {
  const tokens = [
    ['Primary', AWESOME_PG_BRAND.color.primary],
    ['Charcoal', AWESOME_PG_BRAND.color.charcoal],
    ['Deep', AWESOME_PG_BRAND.color.deep],
    ['Silver', AWESOME_PG_BRAND.color.silver],
  ] as const;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12 text-white">
      <header className="space-y-2 border-b border-white/10 pb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-apg-silver">Customer platform</p>
        <h1 className="text-3xl font-semibold tracking-tight">{AWESOME_PG.name}</h1>
        <p className="text-sm text-apg-silver">{AWESOME_PG.tagline}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Mark · dark">
          <AwesomePgMark size={128} />
        </Section>
        <Section title="Mark · light surface">
          <div className="rounded-xl bg-apg-warm-bg p-6">
            <AwesomePgMark size={128} style="light" surface="light" />
          </div>
        </Section>
      </div>

      <Section title="Header lockup">
        <div className="flex items-center gap-3 rounded-xl bg-apg-charcoal p-4">
          <AwesomePgLogo size={32} />
          <span className="font-semibold">Awesome PG</span>
        </div>
      </Section>

      <Section title="Favicon ladder">
        <div className="flex flex-wrap items-end gap-4">
          {SIZES.map((s) => (
            <div key={s} className="text-center">
              <AwesomePgMark size={s} />
              <p className="mt-1 text-[10px] text-apg-muted">{s}px</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Browser tab mock">
        <div className="flex items-center gap-2 rounded-t-lg bg-zinc-800 px-3 py-2 text-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/awesome-pg/favicon-32.svg" alt="" className="h-4 w-4" />
          <span>Browse PGs · Awesome PG</span>
        </div>
      </Section>

      <Section title="Palette">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tokens.map(([label, hex]) => (
            <div key={label} className="rounded-lg border border-white/10 p-3">
              <div className="mb-2 h-10 rounded-md" style={{ background: hex }} />
              <p className="text-xs text-apg-silver">{label}</p>
              <p className="font-mono text-[10px] text-apg-muted">{hex}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="PWA">
        <p className="text-sm text-apg-silver">
          Manifest: <code className="text-apg-orange">/awesome-pg/manifest.webmanifest</code> · theme{' '}
          {AWESOME_PG_BRAND.color.primary}
        </p>
      </Section>
    </div>
  );
}
