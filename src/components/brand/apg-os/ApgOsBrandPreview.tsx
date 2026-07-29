import type { ReactNode } from 'react';
import Image from 'next/image';
import { AdminLoginShell } from '@/src/components/brand/apg-os/AdminLoginShell';
import { ApgOsMark } from '@/src/components/brand/apg-os/ApgOsMark';
import { ApgOsSidebarBrand } from '@/src/components/brand/apg-os/ApgOsSidebarBrand';
import { ApgOsWordmark } from '@/src/components/brand/apg-os/ApgOsWordmark';
import { APG_OS, APG_OS_BRAND } from '@/src/lib/brand/apgOsTokens';

const SIZE_TEST = [16, 20, 24, 32, 48, 64, 128, 512] as const;

const FAVICON_FILES = [
  { label: '16', file: 'favicon-16.svg' },
  { label: '20', file: 'favicon-20.svg' },
  { label: '24', file: 'favicon-24.svg' },
  { label: '32', file: 'favicon-32.svg' },
  { label: '48', file: 'favicon-48.svg' },
  { label: '64', file: 'icon-64.svg' },
  { label: '128', file: 'icon-128.svg' },
  { label: '512', file: 'icon-512.svg' },
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="mb-4 text-[11px] font-medium uppercase tracking-wide text-apg-silver">{title}</h2>
      {children}
    </section>
  );
}

export function ApgOsBrandPreview() {
  const tokens = [
    ['Primary', APG_OS_BRAND.color.primary],
    ['Hover', APG_OS_BRAND.color.primaryHover],
    ['Shell', APG_OS_BRAND.color.bgShell],
    ['Surface', APG_OS_BRAND.color.bgSurface],
    ['Border', APG_OS_BRAND.color.border],
    ['Text', APG_OS_BRAND.color.textPrimary],
    ['Secondary', APG_OS_BRAND.color.textSecondary],
    ['Success', APG_OS_BRAND.color.success],
    ['Warning', APG_OS_BRAND.color.warning],
    ['Danger', APG_OS_BRAND.color.danger],
  ] as const;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      <header className="space-y-2 border-b border-white/10 pb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-apg-silver">Production identity</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">{APG_OS.name}</h1>
        <p className="text-sm text-apg-silver">
          Master brand for the Awesome PG Admin Panel · {APG_OS.tagline}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Large logo · dark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/admin-os/logo-full-dark.svg" alt="" className="w-full max-w-lg rounded-xl bg-[#0B0F14] p-6" />
        </Section>
        <Section title="Large logo · light">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/admin-os/logo-full-light.svg" alt="" className="w-full max-w-lg rounded-xl bg-white p-6" />
        </Section>
        <Section title="Compact logo · dark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/admin-os/logo-compact-dark.svg" alt="" className="max-w-md rounded-xl bg-[#0B0F14] p-4" />
        </Section>
        <Section title="Wordmark component">
          <div className="space-y-6 rounded-xl bg-[#0B0F14] p-6">
            <ApgOsWordmark surface="dark" size="lg" showTagline />
          </div>
          <div className="mt-4 rounded-xl bg-white p-6">
            <ApgOsWordmark surface="light" size="lg" showTagline />
          </div>
        </Section>
      </div>

      <Section title="Icon system — Primary · Filled · Outline · Monochrome">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ['Primary', 'primary', 'dark'],
              ['Filled', 'filled', 'dark'],
              ['Outline', 'outline', 'light'],
              ['Monochrome', 'monochrome', 'dark'],
            ] as const
          ).map(([label, style, surface]) => (
            <div key={label} className="rounded-xl border border-white/10 p-4">
              <p className="mb-3 text-xs font-medium text-apg-silver">{label}</p>
              <div
                className={`flex justify-center rounded-lg p-6 ${surface === 'light' ? 'bg-white' : 'bg-[#0B0F14]'}`}
              >
                <ApgOsMark size={72} style={style} surface={surface} />
              </div>
              <p className="mt-2 text-center text-[10px] text-apg-silver/70">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <a href={`/admin-os/mark-${label === 'Primary' ? 'primary-dark' : label === 'Filled' ? 'filled' : label === 'Outline' ? 'outline-light' : 'mono-white'}.svg`} className="hover:text-white">
                  SVG
                </a>
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Minimum size test (filled mark — auto below 24px)">
        <div className="flex flex-wrap items-end gap-4">
          {SIZE_TEST.map((px) => (
            <div key={px} className="text-center">
              <div className="flex items-center justify-center rounded-md border border-white/10 bg-[#0B0F14] p-2">
                <ApgOsMark size={px > 128 ? 128 : px} style="primary" surface="dark" />
              </div>
              <p className="mt-1 font-mono text-[10px] text-apg-silver">{px}px</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Static favicon / PWA assets (SVG)">
        <div className="flex flex-wrap items-end gap-5">
          {FAVICON_FILES.map(({ label, file }) => (
            <div key={file} className="text-center">
              <div className="mx-auto flex items-center justify-center rounded border border-white/10 bg-[#0B0F14] p-1.5">
                <Image src={`/admin-os/${file}`} alt="" width={Math.min(64, Number(label) || 32)} height={Math.min(64, Number(label) || 32)} unoptimized />
              </div>
              <p className="mt-1 font-mono text-[10px] text-apg-silver">{label}px</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Browser tab">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#2a2a2e]">
            <div className="flex gap-1.5 border-b border-black/40 bg-[#3a3a3f] px-3 py-2">
              <span className="size-2 rounded-full bg-[#ff5f57]" />
              <span className="size-2 rounded-full bg-[#febc2e]" />
              <span className="size-2 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex items-center gap-2 bg-[#1e1e22] px-3 py-2">
              <Image src="/admin-os/favicon-32.svg" alt="" width={16} height={16} unoptimized />
              <span className="truncate text-xs text-white/90">Overview · APG OS</span>
            </div>
          </div>
        </Section>
        <Section title="Mobile home screen / PWA">
          <div className="flex items-center gap-4">
            <Image src="/admin-os/apple-touch-icon.svg" alt="" width={72} height={72} className="rounded-[18px]" unoptimized />
            <div>
              <p className="font-medium text-white">APG OS</p>
              <p className="text-sm text-apg-silver">Admin Panel</p>
            </div>
          </div>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Sidebar · expanded">
          <div className="w-64 overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
            <ApgOsSidebarBrand />
            <div className="space-y-0.5 px-3 pb-4">
              {['Overview', 'Operations', 'Billing'].map((l) => (
                <div key={l} className="rounded-lg px-3 py-2 text-sm text-apg-silver">
                  {l}
                </div>
              ))}
            </div>
          </div>
        </Section>
        <Section title="Sidebar · collapsed">
          <div className="w-14 overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
            <ApgOsSidebarBrand collapsed />
          </div>
        </Section>
      </div>

      <Section title="Login shell preview">
        <div className="overflow-hidden rounded-xl border border-white/10">
          <div className="pointer-events-none max-h-[420px] overflow-hidden opacity-95">
            <AdminLoginShell>
              <div className="mx-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
                <p className="text-sm text-slate-500">Sign-in card (interactive on /admin/login)</p>
              </div>
            </AdminLoginShell>
          </div>
        </div>
      </Section>

      <Section title="Design tokens">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tokens.map(([name, hex]) => (
            <div key={name} className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2">
              <span
                className="size-9 shrink-0 rounded-md border border-white/10"
                style={{ background: hex.startsWith('rgba') ? hex : hex }}
              />
              <div>
                <p className="text-xs font-medium text-white">{name}</p>
                <p className="font-mono text-[10px] text-apg-silver">{hex}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-apg-silver">
          CSS variables: <code className="text-white">src/styles/apg-os-tokens.css</code> · TS:{' '}
          <code className="text-white">APG_OS_BRAND</code>
        </p>
      </Section>

      <Section title="Branding checklist (admin shell)">
        <ul className="list-inside list-disc space-y-1 text-sm text-apg-silver">
          <li>Favicon / PWA / Apple → <code className="text-white">/admin-os/*</code></li>
          <li>Manifest → <code className="text-white">/admin-os/manifest.webmanifest</code></li>
          <li>Metadata → <code className="text-white">apgOsAdminMetadata</code></li>
          <li>No customer house logo in sidebar, header, login, or tab icons</li>
          <li className="text-amber-200/90">In-app CTAs may still use legacy orange — UI migration is a separate pass</li>
        </ul>
      </Section>
    </div>
  );
}
