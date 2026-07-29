import type { ReactNode } from 'react';
import { ApgOsMark } from '@/src/components/brand/apg-os/ApgOsMark';
import { ApgOsWordmark } from '@/src/components/brand/apg-os/ApgOsWordmark';
import { APG_OS, APG_OS_BRAND } from '@/src/lib/brand/apgOsTokens';

/** Premium split login — distinct from customer marketing site. */
export function AdminLoginShell({ children }: { children: ReactNode }) {
  return (
    <div className="apg-os-auth flex min-h-[100dvh] bg-[var(--apg-os-bg-shell,#f8fafc)] text-slate-900 scheme-light">
      <aside
        className="relative hidden w-[min(440px,42vw)] shrink-0 flex-col justify-between overflow-hidden border-r border-white/10 p-10 lg:flex"
        style={{ background: APG_OS_BRAND.color.bgShell }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: APG_OS_BRAND.color.gradient }}
          aria-hidden
        />
        <div className="relative z-10 flex items-center gap-3">
          <ApgOsMark size={40} style="filled" surface="dark" />
          <ApgOsWordmark surface="dark" size="md" />
        </div>
        <div className="relative z-10 space-y-4">
          <p className="max-w-xs text-2xl font-semibold tracking-tight text-white">{APG_OS.tagline}</p>
          <p className="max-w-sm text-sm leading-relaxed text-apg-silver">
            Secure operations console for property teams — billing, residents, deposits, and day-to-day
            control in one system.
          </p>
        </div>
        <p className="relative z-10 text-[11px] text-apg-silver/60">© {new Date().getFullYear()} APG OS</p>
      </aside>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="mb-8 flex flex-col items-center lg:hidden">
          <ApgOsMark size={48} style="filled" surface="light" className="mb-4" />
          <ApgOsWordmark surface="light" size="lg" showTagline />
        </div>
        {children}
      </main>
    </div>
  );
}
