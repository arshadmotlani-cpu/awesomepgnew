'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { AwesomePgLogo } from '@/src/components/brand/AwesomePgLogo';
import { AdminLoginShell } from '@/src/components/brand/apg-os/AdminLoginShell';
import { ApgOsMark } from '@/src/components/brand/apg-os/ApgOsMark';
import { ApgOsSidebarBrand } from '@/src/components/brand/apg-os/ApgOsSidebarBrand';
import { ApgOsWordmark } from '@/src/components/brand/apg-os/ApgOsWordmark';
import { APG_OS, APG_OS_BRAND } from '@/src/lib/brand/apgOsTokens';
import '@/src/styles/apg-os-tokens.css';

const FAVICON_SIZES = [
  { px: 16, file: 'favicon-16.svg' },
  { px: 32, file: 'favicon-32.svg' },
  { px: 48, file: 'favicon-48.svg' },
  { px: 64, file: 'icon-64.svg' },
  { px: 128, file: 'icon-128.svg' },
  { px: 512, file: 'icon-512.svg' },
] as const;

function DeckSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 border-t border-white/[0.06] py-16 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--apg-os-primary-soft,#60a5fa)]">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h2>
      {description ? <p className="mt-3 max-w-2xl text-sm leading-relaxed text-apg-silver">{description}</p> : null}
      <div className="mt-10">{children}</div>
    </section>
  );
}

function CompareColumn({
  side,
  title,
  subtitle,
  accent,
  children,
}: {
  side: 'current' | 'proposed';
  title: string;
  subtitle: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121820] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="border-b border-white/10 px-5 py-4" style={{ borderTopColor: accent, borderTopWidth: 3 }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-apg-silver/80">
          {side === 'current' ? 'Current' : 'Proposed'}
        </p>
        <p className="mt-1 text-lg font-semibold text-white">{title}</p>
        <p className="text-xs text-apg-silver">{subtitle}</p>
      </div>
      <div className="flex flex-1 flex-col p-5">{children}</div>
    </div>
  );
}

function ChromeBrowserMock({
  faviconSrc,
  title,
  variant,
}: {
  faviconSrc: string;
  title: string;
  variant: 'chrome' | 'safari' | 'generic';
}) {
  const tabRounded = variant === 'safari' ? 'rounded-t-lg' : 'rounded-t-[10px]';
  const barBg = variant === 'safari' ? 'bg-[#ececec]' : 'bg-[#dee1e6]';
  const tabBg = variant === 'safari' ? 'bg-[#f5f5f7]' : 'bg-white';

  return (
    <div className="overflow-hidden rounded-xl border border-black/20 shadow-2xl">
      <div className={`flex items-center gap-2 px-3 py-2 ${barBg}`}>
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        {variant === 'chrome' ? (
          <div className="ml-2 flex flex-1 gap-1">
            <div className={`flex max-w-[220px] flex-1 items-center gap-2 ${tabBg} ${tabRounded} px-3 py-1.5 shadow-sm`}>
              <Image src={faviconSrc} alt="" width={14} height={14} unoptimized className="shrink-0" />
              <span className="truncate text-[11px] text-zinc-700">{title}</span>
            </div>
            <div className="hidden w-16 rounded-t-lg bg-white/40 sm:block" />
          </div>
        ) : (
          <div className={`mx-2 flex flex-1 items-center gap-2 rounded-lg ${tabBg} px-3 py-2`}>
            <Image src={faviconSrc} alt="" width={14} height={14} unoptimized />
            <span className="truncate text-[11px] font-medium text-zinc-800">{title}</span>
          </div>
        )}
      </div>
      <div className="h-32 bg-[#0B0F14] p-4">
        <div className="h-full rounded-lg border border-dashed border-white/10" />
      </div>
    </div>
  );
}

function PhoneHomeMock({
  platform,
  iconSrc,
  label,
}: {
  platform: 'iphone' | 'android' | 'pwa';
  iconSrc: string;
  label: string;
}) {
  const frame =
    platform === 'android'
      ? 'rounded-[28px] border-[3px] border-zinc-700 bg-zinc-900'
      : 'rounded-[36px] border-[3px] border-zinc-800 bg-black';

  return (
    <div className={`mx-auto w-[200px] p-2 shadow-2xl ${frame}`}>
      <div
        className={`overflow-hidden ${platform === 'android' ? 'rounded-[22px]' : 'rounded-[30px]'} bg-gradient-to-b from-indigo-950 to-[#0B0F14] px-4 pb-6 pt-10`}
      >
        {platform === 'iphone' ? (
          <div className="mx-auto mb-6 h-6 w-24 rounded-full bg-black/80" />
        ) : null}
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-1 flex flex-col items-center gap-1">
            <Image
              src={iconSrc}
              alt=""
              width={platform === 'pwa' ? 56 : 52}
              height={platform === 'pwa' ? 56 : 52}
              className={platform === 'iphone' ? 'rounded-[13px]' : 'rounded-2xl'}
              unoptimized
            />
            <span className="max-w-[52px] truncate text-[9px] text-white/90">{label}</span>
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="size-[52px] rounded-2xl bg-white/10" />
          ))}
        </div>
        {platform === 'pwa' ? (
          <p className="mt-6 text-center text-[9px] uppercase tracking-wider text-white/40">Add to Home Screen</p>
        ) : null}
      </div>
    </div>
  );
}

function LegacySidebarMock({ collapsed }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <div className="flex w-14 flex-col items-center border-r border-white/5 bg-[#1A1F27] py-4">
        <AwesomePgLogo size={32} className="shadow-md shadow-orange-500/25" />
      </div>
    );
  }
  return (
    <div className="w-56 border-r border-white/5 bg-[#1A1F27] p-4">
      <div className="flex items-center gap-2">
        <AwesomePgLogo size={36} className="shadow-md shadow-orange-500/25" />
        <div>
          <p className="text-sm font-semibold text-white">Awesome PG</p>
          <p className="text-[10px] text-apg-silver">Admin</p>
        </div>
      </div>
    </div>
  );
}

function LegacyHeaderMock() {
  return (
    <div className="flex items-center gap-2 border-b border-white/5 bg-[#0B0F14] px-4 py-3">
      <AwesomePgLogo size={28} />
      <div>
        <p className="text-sm font-semibold text-white">Awesome PG</p>
        <p className="text-[10px] text-apg-silver">Admin console</p>
      </div>
      <div className="ml-auto size-7 rounded-full bg-[#FF5A1F]" />
    </div>
  );
}

function LegacyLoginMock() {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-xl bg-zinc-100 p-6">
      <div className="w-full max-w-xs rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <AwesomePgLogo size={48} className="mb-2 shadow-md shadow-orange-500/20" />
          <p className="text-sm font-semibold text-zinc-900">Admin sign in</p>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-9 rounded-md bg-zinc-100" />
          <div className="h-9 rounded-md bg-zinc-100" />
          <div className="h-10 rounded-md bg-zinc-900" />
        </div>
      </div>
    </div>
  );
}

export function BrandGuidelinesDeck() {
  return (
    <div className="apg-brand-deck relative -mx-3 min-w-0 bg-[#080a0e] sm:-mx-4 lg:-mx-8">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-white/[0.06] px-6 py-14 sm:px-10 lg:px-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{ background: APG_OS_BRAND.color.gradient }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-200">
            <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
            Preview only — live admin still uses Awesome PG branding
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">{APG_OS.name}</h1>
          <p className="mt-2 text-lg text-apg-silver">{APG_OS.subtitle}</p>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-apg-silver/90">{APG_OS.tagline}</p>
          <p className="mt-8 text-xs text-apg-silver/60">
            Brand guidelines v1 · Admin Panel identity · Approve to wire{' '}
            <code className="rounded bg-white/5 px-1 text-apg-silver">apgOsAdminMetadata</code> + shell components
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 pb-24 sm:px-10 lg:px-14">
        {/* Side by side executive compare */}
        <DeckSection
          eyebrow="01 · Comparison"
          title="Current vs proposed"
          description="Same product, two identities. Customer website stays orange; admin becomes blue OS software."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <CompareColumn
              side="current"
              title="Awesome PG Admin"
              subtitle="House mark · orange accent · shared with customer"
              accent="#FF5A1F"
            >
              <div className="flex justify-center py-6">
                <AwesomePgLogo size={80} className="shadow-lg shadow-orange-500/30" />
              </div>
              <ul className="space-y-2 text-sm text-apg-silver">
                <li>PNG house / property icon</li>
                <li>“Awesome PG” wordmark in sidebar</li>
                <li>Orange avatar &amp; CTAs</li>
                <li>Customer-adjacent tab favicon</li>
              </ul>
            </CompareColumn>
            <CompareColumn
              side="proposed"
              title="APG OS"
              subtitle="Hex + A · enterprise blue · admin-only"
              accent={APG_OS_BRAND.color.primary}
            >
              <div className="flex justify-center py-4">
                <ApgOsMark size={88} style="filled" surface="dark" />
              </div>
              <ApgOsWordmark surface="dark" size="lg" showTagline className="text-center sm:text-left" />
              <ul className="mt-4 space-y-2 text-sm text-apg-silver">
                <li>Geometric system mark (not a house)</li>
                <li>APG OS product name + Admin Panel tier</li>
                <li>Blue OS chrome &amp; auth surfaces</li>
                <li>Dedicated SVG favicon / PWA set</li>
              </ul>
            </CompareColumn>
          </div>
        </DeckSection>

        {/* Logo system */}
        <DeckSection
          eyebrow="02 · Logo system"
          title="Marks & lockups"
          description="Large and compact lockups, icon-only, and monochrome for restricted contexts."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#0B0F14] p-8">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-apg-silver">Large · dark</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/admin-os/logo-full-dark.svg" alt="" className="mt-4 w-full max-w-md" />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white p-8">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Large · light</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/admin-os/logo-full-light.svg" alt="" className="mt-4 w-full max-w-md" />
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0B0F14] p-6">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-apg-silver">Small / compact</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/admin-os/logo-compact-dark.svg" alt="" className="mt-4 max-w-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(
                [
                  ['Primary', 'primary', 'dark'],
                  ['Filled', 'filled', 'dark'],
                  ['Outline', 'outline', 'light'],
                  ['Mono', 'monochrome', 'dark'],
                ] as const
              ).map(([label, style, surface]) => (
                <div
                  key={label}
                  className={`rounded-xl border border-white/10 p-4 ${surface === 'light' ? 'bg-white' : 'bg-[#0B0F14]'}`}
                >
                  <p className="text-[10px] text-apg-silver">{label}</p>
                  <div className="mt-3 flex justify-center">
                    <ApgOsMark size={56} style={style} surface={surface} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DeckSection>

        {/* Browser */}
        <DeckSection
          eyebrow="03 · Browser"
          title="Tab & favicon context"
          description="How operators distinguish admin tabs from customer site and other products."
        >
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-medium text-apg-silver">Current · Awesome PG</p>
              <div className="space-y-4">
                <ChromeBrowserMock
                  variant="chrome"
                  faviconSrc="/icons/apg-favicon-32.png"
                  title="Overview · Admin · Awesome PG"
                />
                <ChromeBrowserMock
                  variant="safari"
                  faviconSrc="/icons/apg-favicon-32.png"
                  title="Admin · Awesome PG"
                />
              </div>
            </div>
            <div>
              <p className="mb-3 text-xs font-medium text-[var(--apg-os-primary-soft)]">Proposed · APG OS</p>
              <div className="space-y-4">
                <ChromeBrowserMock
                  variant="chrome"
                  faviconSrc="/admin-os/favicon-32.svg"
                  title="Overview · APG OS"
                />
                <ChromeBrowserMock
                  variant="safari"
                  faviconSrc="/admin-os/favicon-32.svg"
                  title="APG OS"
                />
              </div>
            </div>
          </div>
        </DeckSection>

        {/* App shell */}
        <DeckSection
          eyebrow="04 · Application"
          title="In-product surfaces"
          description="Sidebar, header, and login — side-by-side mockups (not live until approved)."
        >
          <div className="grid gap-8">
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-apg-silver">Sidebar</p>
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-[10px] text-apg-silver">Current · expanded</p>
                  <div className="flex overflow-hidden rounded-xl border border-white/10">
                    <LegacySidebarMock />
                    <div className="flex-1 bg-[#0B0F14] p-4 text-xs text-apg-silver">Content</div>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[10px] text-[var(--apg-os-primary-soft)]">Proposed · expanded</p>
                  <div className="flex overflow-hidden rounded-xl border border-[var(--apg-os-primary)]/30">
                    <div className="w-56 bg-[#1A1F27]">
                      <ApgOsSidebarBrand />
                    </div>
                    <div className="flex-1 bg-[#0B0F14] p-4 text-xs text-apg-silver">Content</div>
                  </div>
                </div>
              </div>
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-[10px] text-apg-silver">Current · collapsed</p>
                  <div className="flex overflow-hidden rounded-xl border border-white/10">
                    <LegacySidebarMock collapsed />
                    <div className="flex-1 bg-[#0B0F14]" />
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[10px] text-[var(--apg-os-primary-soft)]">Proposed · collapsed</p>
                  <div className="flex overflow-hidden rounded-xl border border-[var(--apg-os-primary)]/30">
                    <ApgOsSidebarBrand collapsed />
                    <div className="flex-1 bg-[#0B0F14]" />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-apg-silver">Dashboard header</p>
                <div className="overflow-hidden rounded-xl border border-white/10">
                  <LegacyHeaderMock />
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--apg-os-primary-soft)]">
                  Dashboard header
                </p>
                <div className="overflow-hidden rounded-xl border border-[var(--apg-os-primary)]/30">
                  <div className="flex items-center gap-3 border-b border-white/5 bg-[#0B0F14] px-4 py-3">
                    <ApgOsMark size={28} style="primary" surface="dark" />
                    <ApgOsWordmark surface="dark" size="sm" showSubtitle={false} />
                    <p className="hidden text-sm text-apg-silver lg:block">Admin Panel</p>
                    <div className="ml-auto size-7 rounded-full bg-[var(--apg-os-primary)]" />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-apg-silver">Login</p>
                <LegacyLoginMock />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--apg-os-primary-soft)]">
                  Login
                </p>
                <div className="overflow-hidden rounded-xl border border-[var(--apg-os-primary)]/30">
                  <div className="pointer-events-none max-h-[320px] overflow-hidden">
                    <AdminLoginShell>
                      <div className="mx-auto w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
                        <p className="text-xs text-slate-500">Sign in card</p>
                        <div className="mt-3 h-9 rounded bg-slate-100" />
                        <div className="mt-2 h-9 rounded bg-slate-100" />
                        <div className="mt-3 h-10 rounded bg-[var(--apg-os-primary)]" />
                      </div>
                    </AdminLoginShell>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DeckSection>

        {/* Home screen */}
        <DeckSection
          eyebrow="05 · Install"
          title="PWA & home screen"
          description="Installed admin app should read as APG OS, not the customer house icon."
        >
          <div className="grid gap-10 md:grid-cols-3">
            <div className="text-center">
              <p className="mb-4 text-xs font-medium text-apg-silver">Current (iPhone)</p>
              <PhoneHomeMock platform="iphone" iconSrc="/icons/apg-apple-touch.png" label="Awesome PG" />
            </div>
            <div className="text-center">
              <p className="mb-4 text-xs font-medium text-[var(--apg-os-primary-soft)]">Proposed (iPhone)</p>
              <PhoneHomeMock platform="iphone" iconSrc="/admin-os/apple-touch-icon.svg" label="APG OS" />
            </div>
            <div className="text-center">
              <p className="mb-4 text-xs font-medium text-[var(--apg-os-primary-soft)]">Proposed (Android / PWA)</p>
              <PhoneHomeMock platform="android" iconSrc="/admin-os/icon-192.svg" label="APG OS" />
            </div>
          </div>
        </DeckSection>

        {/* Favicons */}
        <DeckSection
          eyebrow="06 · Favicon matrix"
          title="SVG size ladder"
          description="Filled mark for small sizes; shell background on 180+ PWA assets."
        >
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <p className="mb-4 text-xs text-apg-silver">Current (PNG)</p>
              <div className="flex flex-wrap gap-4">
                {[16, 32, 48, 64, 128, 512].map((px) => (
                  <div key={px} className="text-center">
                    <div className="flex size-16 items-center justify-center rounded-lg border border-white/10 bg-[#1A1F27]">
                      <Image
                        src="/icons/apg-favicon-32.png"
                        alt=""
                        width={Math.min(px, 48)}
                        height={Math.min(px, 48)}
                        unoptimized
                      />
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-apg-silver">{px}×{px}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-4 text-xs text-[var(--apg-os-primary-soft)]">Proposed (SVG)</p>
              <div className="flex flex-wrap gap-4">
                {FAVICON_SIZES.map(({ px, file }) => (
                  <div key={file} className="text-center">
                    <div className="flex size-16 items-center justify-center rounded-lg border border-[var(--apg-os-primary)]/20 bg-[#0B0F14]">
                      <Image
                        src={`/admin-os/${file}`}
                        alt=""
                        width={Math.min(px, 56)}
                        height={Math.min(px, 56)}
                        unoptimized
                      />
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-apg-silver">{px}×{px}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DeckSection>

        {/* Approval */}
        <section className="mt-16 rounded-2xl border border-[var(--apg-os-primary)]/25 bg-[var(--apg-os-primary-subtle)] p-8 text-center">
          <h2 className="text-xl font-semibold text-white">Ready for your review</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-apg-silver">
            Nothing on this page changes production branding. When you approve, we wire APG OS into sidebar, login,
            metadata, manifest, and push icons — customer site unchanged.
          </p>
          <p className="mt-6 text-xs text-apg-silver/70">
            Reply in chat: <span className="text-white">“Approve APG OS branding”</span> to go live.
          </p>
        </section>
      </div>
    </div>
  );
}
